import fs from 'node:fs';
import path from 'node:path';

/**
 * The files that teach an AI coding agent how to build on the CMS: the rules (`.agents/cms.md`)
 * and the `cms-*` skills, kept in both places agents look for skills (`.agents/skills/` and
 * `.claude/skills/`). They ship in this package (`agents/`) and travel with the CMS, so a site
 * on plain Astro gets them too and they match the version the site runs. `velocity-cms init`
 * installs them and `velocity-cms agents` brings them up to date; both replace what the CMS
 * wrote and leave the site's own files alone.
 */

/** Where the rules go in a site. */
export const CMS_RULES_FILE = '.agents/cms.md';
/** The folders a skill is written to, one copy in each. */
const SKILL_FOLDERS = ['.agents/skills', '.claude/skills'];
/** The line the site's AGENTS.md gains, so an agent finds the rules. */
export const AGENTS_LINE = '- This site uses Velocity CMS. Before changing content types, pages, sections, forms, menus or how the site is deployed, read `.agents/cms.md` and use the `cms-*` skills.';

const source = new URL('../agents/', import.meta.url);

/** The version of the CMS the files come from. The rules carry it, and `velocity-cms check` compares it. */
export const AGENT_FILES_VERSION: string = (JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version;

/** The skills this version ships, by name. */
export function shippedSkills(): string[] {
  return fs
    .readdirSync(new URL('skills/', source), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('cms-'))
    .map((entry) => entry.name)
    .sort();
}

function stamped(text: string): string {
  const mark = `<!-- velocity-cms ${AGENT_FILES_VERSION}. Written by \`velocity-cms agents\`, which replaces this file: keep your own notes in AGENTS.md. -->`;
  return `${mark}\n\n${text}`;
}

/** Writes a file unless it already holds exactly that. Answers whether it changed. */
function write(file: string, text: string): boolean {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return true;
}

/**
 * Installs the rules and skills in a site's folder and points its AGENTS.md at them (making one
 * if it has none, and a CLAUDE.md that reads it). A skill the CMS no longer ships is removed; a
 * skill of the site's own, whose name does not start with `cms-`, is never touched.
 */
export function installAgentFiles(dir: string, print: (line: string) => void): void {
  const at = (file: string) => path.join(dir, file);
  const changed: string[] = [];
  if (write(at(CMS_RULES_FILE), stamped(fs.readFileSync(new URL('cms.md', source), 'utf8')))) changed.push(CMS_RULES_FILE);

  const skills = shippedSkills();
  for (const folder of SKILL_FOLDERS) {
    for (const skill of skills) {
      if (write(at(`${folder}/${skill}/SKILL.md`), fs.readFileSync(new URL(`skills/${skill}/SKILL.md`, source), 'utf8'))) changed.push(`${folder}/${skill}`);
    }
    // A cms- skill an earlier version wrote and this one does not ship.
    if (!fs.existsSync(at(folder))) continue;
    for (const entry of fs.readdirSync(at(folder), { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith('cms-') && !skills.includes(entry.name)) {
        fs.rmSync(at(`${folder}/${entry.name}`), { recursive: true });
        changed.push(`${folder}/${entry.name} (removed)`);
      }
    }
  }

  const agents = at('AGENTS.md');
  if (!fs.existsSync(agents)) {
    fs.writeFileSync(agents, `# Agent guide\n\nInstructions for AI coding agents working on this site.\n\n${AGENTS_LINE}\n`);
    changed.push('AGENTS.md');
    if (!fs.existsSync(at('CLAUDE.md'))) {
      fs.writeFileSync(at('CLAUDE.md'), '@AGENTS.md\n');
      changed.push('CLAUDE.md');
    }
  } else {
    const text = fs.readFileSync(agents, 'utf8');
    if (!text.includes(CMS_RULES_FILE)) {
      fs.writeFileSync(agents, `${text}${text.endsWith('\n') ? '' : '\n'}\n${AGENTS_LINE}\n`);
      changed.push('AGENTS.md');
    }
  }

  print(changed.length > 0 ? `Agent files: wrote ${changed.join(', ')}.` : 'Agent files: already up to date.');
}
