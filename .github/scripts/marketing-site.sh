#!/usr/bin/env bash
# Says where the marketing site's CMS lives (deployvelocity.com, the velocity-marketing
# repository): its database on Turso, found by name and made the first time, a token for this
# run, and its secret. Written to the job's environment for the steps that follow. Read by the
# Marketing site workflow.
#
#   TURSO_API_TOKEN=... BASE_SECRET=... bash .github/scripts/marketing-site.sh
#
# The secret is worked out from BASE_SECRET (the VELOCITY_CMS_SECRET secret) and the database's
# name, not a Vercel project's: the preview and the live site share one database, and what the
# CMS keeps sealed in it (an email key saved under Settings) opens only with the same secret.
set -euo pipefail

fail() {
  echo "::error::$1"
  exit 1
}

database="${MARKETING_DATABASE:-velocity-marketing}"

[ -n "${BASE_SECRET:-}" ] || fail "Missing: VELOCITY_CMS_SECRET. Add it under Settings, Secrets and variables, Actions."
[ "${#BASE_SECRET}" -ge 32 ] || fail "VELOCITY_CMS_SECRET must be at least 32 characters."
[ -n "${TURSO_API_TOKEN:-}" ] || fail "Missing: TURSO_API_TOKEN, which finds or makes the marketing site's database. Make one at https://app.turso.tech/api-tokens and add it under Settings, Secrets and variables, Actions."

organization="${TURSO_ORGANIZATION:-velocity}"
api="https://api.turso.tech/v1/organizations/$organization/databases"
auth="Authorization: Bearer $TURSO_API_TOKEN"
answer=$(mktemp)
# An error names the step and the status and nothing else: an answer may hold a token.
status=$(curl -sS -o "$answer" -w '%{http_code}' -H "$auth" "$api/$database") || status=000
made=false
if [ "$status" = "404" ]; then
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
status=$(curl -sS -o "$answer" -w '%{http_code}' -X POST -H "$auth" "$api/$database/auth/tokens") || status=000
token=$(jq -r '.jwt // empty' "$answer" 2> /dev/null || true)
rm -f "$answer"
if [ "$status" != "200" ] || [ -z "$token" ]; then
  fail "Turso answered $status when asked for a token for the database $database."
fi
secret=$(printf '%s' "$BASE_SECRET:$database" | sha256sum | cut -d ' ' -f 1)

# Neither may show in a log, whatever a later step prints.
echo "::add-mask::$token"
echo "::add-mask::$secret"
{
  echo "DATABASE_MADE=$made"
  echo "VELOCITY_CMS_DATABASE_URL=libsql://$host"
  echo "VELOCITY_CMS_DATABASE_TOKEN=$token"
  echo "VELOCITY_CMS_SECRET=$secret"
} >> "$GITHUB_ENV"
