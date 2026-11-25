// Writes src/skills.generated.ts: the skills the MCP server publishes, as text.
//
// cms-api runs wherever the site does and reads no files, so the skills (Markdown files, which is
// how they are written and reviewed) are put into a module ahead of time. Run it with
// `pnpm --filter @velocity-astro/cms-api skills` after changing a skill; a test fails while the
// module is stale.
import fs from 'node:fs';

const here = new URL('../', import.meta.url);
/** Each skill's SKILL.md: this package's own, then the one a site's coding agent is also given. */
const sources = [
  ...fs
    .readdirSync(new URL('skills/', here), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => new URL(`skills/${entry.name}/SKILL.md`, here))
    .sort((a, b) => a.pathname.localeCompare(b.pathname)),
  new URL('../cms-astro/agents/skills/cms-add-section/SKILL.md', here),
];

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A skill's name and description, from frontmatter that holds exactly those two, one line each. */
function frontmatter(text, file) {
  const match = /^---\nname: (.+)\ndescription: (.+)\n---\n/.exec(text);
  if (!match) throw new Error(`${file}: a skill starts with "---", then "name:" and "description:" on one line each, then "---".`);
  const [, name, description] = match;
  const folder = file.split('/').at(-2);
  if (!NAME.test(name) || name.length > 64) throw new Error(`${file}: the name is lowercase letters, numbers and single hyphens, 64 characters at most.`);
  if (name !== folder) throw new Error(`${file}: the name "${name}" must be its folder's name, "${folder}".`);
  if (description.length > 1024) throw new Error(`${file}: the description is ${description.length} characters; 1024 is the most.`);
  // Plain words only, so the two lines mean the same to every YAML reader.
  if (/^["'[{>|&*!%@`]|: | #/.test(description)) throw new Error(`${file}: the description must be plain words (no ": ", " #" or opening quote), since it is read as YAML.`);
  return { name, description };
}

/** The skills as the module holds them. */
export function skills() {
  return sources.map((source) => {
    const text = fs.readFileSync(source, 'utf8').replace(/\r\n/g, '\n');
    return { ...frontmatter(text, source.pathname), text };
  });
}

function generated() {
  return `// Written by scripts/embed-skills.mjs from the SKILL.md files. Do not edit: run \`pnpm --filter @velocity-astro/cms-api skills\`.

/** A skill as it is written: its name, when to use it, and its whole SKILL.md. */
export interface ShippedSkill {
  readonly name: string;
  readonly description: string;
  readonly text: string;
}

export const SHIPPED_SKILLS: readonly ShippedSkill[] = ${JSON.stringify(skills(), null, 2)};
`;
}

const target = new URL('src/skills.generated.ts', here);
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').at(-1) ?? '\0')) {
  fs.writeFileSync(target, generated());
  console.log('Wrote src/skills.generated.ts');
}
