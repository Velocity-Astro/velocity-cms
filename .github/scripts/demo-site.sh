#!/usr/bin/env bash
# Says which demo a workflow is working on: its Vercel project, its address, its database and
# its secret, written to the job's environment for the steps that follow. The address is the
# demo's own domain, which is added to its project in Vercel by hand (Settings, Domains): sign-in
# links and passkeys are made for it, so the project must answer there. This is the one list
# of demos; the Demo and Demo sign-in link workflows both read it.
#
#   DEMO=<real-estate|restaurant> [DEMO_MAKE_DATABASE=true] bash .github/scripts/demo-site.sh
#
# Real estate keeps the database it has always had, from the TURSO_DATABASE_URL and
# TURSO_AUTH_TOKEN secrets (here FIXED_DATABASE_URL and FIXED_DATABASE_TOKEN). A newer demo has
# no secrets of its own: its database is found on Turso by name with TURSO_API_TOKEN, made if
# DEMO_MAKE_DATABASE says so, and a token for it is made for this run. Its secret is worked out
# from BASE_SECRET (the VELOCITY_CMS_SECRET secret) and its project's name, so no two demos
# share one and nothing new has to be stored.
set -euo pipefail

fail() {
  echo "::error::$1"
  exit 1
}

case "${DEMO:-}" in
  real-estate)
    project=velocity-cms-real-estate-demo
    database=
    site=https://realestate.deployvelocity.com
    pages="/ /demo/ /es/ /homes-for-sale/ /listings/lakeshore-farmhouse/ /agents/ /why-list-with-us/"
    ;;
  restaurant)
    project=velocity-cms-restaurant-demo
    database=velocity-cms-restaurant-demo
    site=https://restaurant.deployvelocity.com
    pages="/ /demo/ /es/ /menu/ /evenings/barolo-dinner/ /reserve/ /private-dining/ /gift-cards/"
    ;;
  *)
    fail "There is no demo called \"${DEMO:-}\". The demos are real-estate and restaurant."
    ;;
esac

[ -n "${BASE_SECRET:-}" ] || fail "Missing: VELOCITY_CMS_SECRET. Add it under Settings, Secrets and variables, Actions."
[ "${#BASE_SECRET}" -ge 32 ] || fail "VELOCITY_CMS_SECRET must be at least 32 characters."

made=false
if [ -z "$database" ]; then
  url="${FIXED_DATABASE_URL:-}"
  token="${FIXED_DATABASE_TOKEN:-}"
  secret="$BASE_SECRET"
  if [ -z "$url" ] || [ -z "$token" ]; then
    fail "Missing: TURSO_DATABASE_URL or TURSO_AUTH_TOKEN. Add them under Settings, Secrets and variables, Actions."
  fi
else
  [ -n "${TURSO_API_TOKEN:-}" ] || fail "Missing: TURSO_API_TOKEN, which finds or makes the database of the $DEMO demo. Make one at https://app.turso.tech/api-tokens and add it under Settings, Secrets and variables, Actions."
  organization="${TURSO_ORGANIZATION:-velocity}"
  api="https://api.turso.tech/v1/organizations/$organization/databases"
  auth="Authorization: Bearer $TURSO_API_TOKEN"
  answer=$(mktemp)
  # An error names the step and the status and nothing else: an answer may hold a token.
  status=$(curl -sS -o "$answer" -w '%{http_code}' -H "$auth" "$api/$database") || status=000
  if [ "$status" = "404" ]; then
    [ "${DEMO_MAKE_DATABASE:-false}" = "true" ] || fail "The database $database is not there yet. Run the Demo workflow first: it makes the database."
    status=$(jq -n --arg name "$database" --arg group "${TURSO_GROUP:-default}" '{name: $name, group: $group}' \
      | curl -sS -o "$answer" -w '%{http_code}' -X POST -H "$auth" -H 'Content-Type: application/json' -d @- "$api") || status=000
    [ "${status:0:1}" = "2" ] || fail "Turso answered $status when asked to make the database $database in the organization $organization. Check the TURSO_API_TOKEN secret and the TURSO_ORGANIZATION and TURSO_GROUP variables."
    made=true
    echo "Made the database $database."
  elif [ "$status" = "200" ]; then
    echo "Found the database $database."
  else
    fail "Turso answered $status when asked for the database $database in the organization $organization. Check the TURSO_API_TOKEN secret and the TURSO_ORGANIZATION variable."
  fi
  host=$(jq -r '.database.Hostname // empty' "$answer")
  [ -n "$host" ] || fail "Turso did not say where the database $database is."
  url="libsql://$host"
  status=$(curl -sS -o "$answer" -w '%{http_code}' -X POST -H "$auth" "$api/$database/auth/tokens") || status=000
  token=$(jq -r '.jwt // empty' "$answer" 2> /dev/null || true)
  rm -f "$answer"
  if [ "$status" != "200" ] || [ -z "$token" ]; then
    fail "Turso answered $status when asked for a token for the database $database."
  fi
  secret=$(printf '%s' "$BASE_SECRET:$project" | sha256sum | cut -d ' ' -f 1)
fi

# Neither may show in a log, whatever a later step prints.
echo "::add-mask::$token"
echo "::add-mask::$secret"
{
  echo "VERCEL_PROJECT=$project"
  echo "SITE_URL=$site"
  echo "DEMO_PAGES=$pages"
  echo "DATABASE_MADE=$made"
  echo "VELOCITY_CMS_DATABASE_URL=$url"
  echo "VELOCITY_CMS_DATABASE_TOKEN=$token"
  echo "VELOCITY_CMS_SECRET=$secret"
} >> "$GITHUB_ENV"
echo "The $DEMO demo: project $project, at $site."
