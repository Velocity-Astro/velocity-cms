#!/usr/bin/env node
/**
 * The GitHub Release of one version, made for its tag (v<version>).
 *
 *   node scripts/github-release.mjs 0.1.0-beta.4            makes the Release (the tag must be on GitHub)
 *   node scripts/github-release.mjs v0.1.0-beta.4           the same: a tag's name is taken too
 *   node scripts/github-release.mjs 0.1.0-beta.4 --notes    prints what the Release would say, and makes nothing
 *
 * What it says: that version's section of CHANGELOG.md, how to install it, then the pull requests
 * merged since the release before, which GitHub lists. A version with a "-" in it (0.1.0-beta.4,
 * 1.0.0-rc.1) is marked a pre-release. A version the changelog does not name still gets a
 * Release, with the list of pull requests alone.
 *
 * It needs the `gh` command signed in (GH_TOKEN in a workflow). A Release that is already there
 * is left as it is.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sections } from './next-release.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A version as numbers and names to compare: 0.1.0-beta.4 is [0, 1, 0] and ['beta', 4]. */
function parts(version) {
  const [main, ...pre] = version.split('-');
  const each = (text) => text.split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part));
  return { main: each(main), pre: pre.length > 0 ? each(pre.join('-')) : null };
}

function compareLists(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    if (a[i] === b[i]) continue;
    if (typeof a[i] === 'number' && typeof b[i] === 'number') return a[i] - b[i];
    // A number comes before a name, as semver has it.
    if (typeof a[i] === 'number') return -1;
    if (typeof b[i] === 'number') return 1;
    return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

/** Which of two versions is earlier. A pre-release comes before the version it leads to. */
export function compare(a, b) {
  const [x, y] = [parts(a), parts(b)];
  const main = compareLists(x.main, y.main);
  if (main !== 0) return main;
  if (x.pre === null || y.pre === null) return x.pre === y.pre ? 0 : x.pre === null ? 1 : -1;
  return compareLists(x.pre, y.pre);
}

/** Whether a version is a pre-release: a beta, a release candidate, anything with a "-". */
export function isPrerelease(version) {
  return version.includes('-');
}

/** The tag of the release before this one, among the tags there are. Nothing for the first. */
export function tagBefore(tags, version) {
  const earlier = tags
    .filter((tag) => /^v\d+\.\d+\.\d+/.test(tag))
    .map((tag) => tag.slice(1))
    .filter((other) => compare(other, version) < 0)
    .sort(compare);
  return earlier.length > 0 ? `v${earlier[earlier.length - 1]}` : null;
}

/** What the Release says before the list of pull requests. */
export function notes(changelog, version) {
  const section = sections(changelog).sections.find((candidate) => candidate.heading === `## ${version}`);
  const install = [
    '## Install',
    '',
    'A site that has the CMS:',
    '',
    '```sh',
    `npm install @velocity-astro/cms-astro@${version}`,
    '```',
    '',
    'A site that does not have it yet: `npx velocity-cms init`.',
  ].join('\n');
  return [section?.body, install].filter(Boolean).join('\n\n') + '\n';
}

function gh(args, options = {}) {
  return execFileSync('gh', args, { cwd: root, encoding: 'utf8', ...options });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    const version = (args.find((arg) => !arg.startsWith('--')) ?? '').replace(/^v/, '');
    if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
      throw new Error('Say which version: node scripts/github-release.mjs 0.1.0-beta.4');
    }
    const tag = `v${version}`;
    const text = notes(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), version);
    if (args.includes('--notes')) {
      process.stdout.write(text);
      process.exit(0);
    }

    const existing = gh(['release', 'list', '--limit', '200', '--json', 'tagName', '--jq', '.[].tagName']).split('\n');
    if (existing.includes(tag)) {
      console.log(`The GitHub Release ${tag} is already there.`);
      process.exit(0);
    }

    const tags = gh(['api', 'repos/{owner}/{repo}/tags', '--paginate', '--jq', '.[].name']).split('\n').filter(Boolean);
    if (!tags.includes(tag)) throw new Error(`There is no tag ${tag} on GitHub. Push it first: git tag ${tag} <commit>, then git push origin ${tag}.`);
    const before = tagBefore(tags, version);

    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'release-')), 'notes.md');
    fs.writeFileSync(file, text);
    gh(
      [
        'release',
        'create',
        tag,
        '--verify-tag',
        '--title',
        version,
        '--notes-file',
        file,
        // GitHub adds the pull requests merged since the release before, and a link to every change.
        '--generate-notes',
        ...(before ? ['--notes-start-tag', before] : []),
        ...(isPrerelease(version) ? ['--prerelease'] : ['--latest']),
      ],
      { stdio: 'inherit' },
    );
    console.log(`Made the GitHub Release ${tag}${isPrerelease(version) ? ', marked a pre-release' : ''}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
