#!/usr/bin/env node
/**
 * The next release, made from what CHANGELOG.md lists under "Unreleased".
 *
 *   node scripts/next-release.mjs --next             the version the next release would have, or nothing when nothing waits
 *   node scripts/next-release.mjs                    gives every package that version and files "Unreleased" under it
 *   node scripts/next-release.mjs --notes 0.1.0-beta.3   what the changelog says of one version
 *
 * While versions are betas the next one is the number after: 0.1.0-beta.2, then 0.1.0-beta.3.
 * Any other step (out of beta, a new minor) is made by hand with scripts/version.mjs.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'CHANGELOG.md');
const UNRELEASED = '## Unreleased';

/** The changelog as what comes before its sections, and each section by its heading. */
export function sections(text) {
  const [intro, ...rest] = text.split(/^(?=## )/m);
  return { intro, sections: rest.map((section) => ({ heading: section.slice(0, section.indexOf('\n')).trim(), body: section.slice(section.indexOf('\n') + 1).trim() })) };
}

/** The version after this one: the last number, one higher. */
export function after(version) {
  const match = /^(.*?)(\d+)$/.exec(version);
  if (!match) throw new Error(`${version} does not end in a number, so the next version cannot be worked out. Set it with scripts/version.mjs.`);
  return `${match[1]}${Number(match[2]) + 1}`;
}

/** The changelog with what was unreleased filed under a version, and an empty "Unreleased" left for what comes next. */
export function released(text, version) {
  const { intro, sections: all } = sections(text);
  const waiting = all.find((section) => section.heading === UNRELEASED);
  if (!waiting || waiting.body === '') throw new Error('CHANGELOG.md lists nothing under "Unreleased", so there is nothing to release.');
  if (all.some((section) => section.heading === `## ${version}`)) throw new Error(`CHANGELOG.md already has a section for ${version}.`);
  const others = all.filter((section) => section !== waiting);
  return [intro.trimEnd(), UNRELEASED, `## ${version}\n\n${waiting.body}`, ...others.map((section) => `${section.heading}\n\n${section.body}`)].join('\n\n') + '\n';
}

function current() {
  const versions = new Set();
  for (const name of fs.readdirSync(path.join(root, 'packages'))) {
    const manifest = path.join(root, 'packages', name, 'package.json');
    if (!fs.existsSync(manifest)) continue;
    const { version, private: isPrivate } = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    if (!isPrivate) versions.add(version);
  }
  if (versions.size !== 1) throw new Error(`The packages do not share one version: ${[...versions].join(', ')}. Run node scripts/version.mjs <version>.`);
  return [...versions][0];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  try {
    const text = fs.readFileSync(file, 'utf8');
    if (args[0] === '--notes') {
      const section = sections(text).sections.find((candidate) => candidate.heading === `## ${args[1]}`);
      if (!section) throw new Error(`CHANGELOG.md has no section for ${args[1]}.`);
      console.log(section.body);
    } else if (args[0] === '--next') {
      const waiting = sections(text).sections.find((section) => section.heading === UNRELEASED);
      if (waiting && waiting.body !== '') console.log(after(current()));
    } else {
      const version = after(current());
      fs.writeFileSync(file, released(text, version));
      execFileSync('node', [path.join(root, 'scripts', 'version.mjs'), version], { stdio: 'inherit' });
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
