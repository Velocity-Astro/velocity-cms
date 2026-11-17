/**
 * The design system's rules, checked.
 *
 *   node scripts/check.mjs
 *
 * 1. Shape     Every component and pattern is one folder with the same six files.
 * 2. Registry  component-registry.json lists exactly the folders that exist, and each is exported.
 * 3. Closed    No part accepts `className` or `style`, so a screen cannot restyle it.
 * 4. Variants  Class names live in `*.variants.ts`, never in the component file.
 * 5. Tokens    Every class resolves against the theme in styles.css. Tailwind's own palette is
 *              switched off there, so `bg-red-500` does not exist. No arbitrary values
 *              (`w-[13px]`), and no raw colours or pixel sizes outside `src/tokens/`.
 *
 * Each finding names the file, the rule and the fix.
 */
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { __unstable__loadDesignSystem as loadDesignSystem } from '@tailwindcss/node';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const LAYERS = { component: 'components', pattern: 'patterns' };
const FILES = (name) => [`${name}.tsx`, `${name}.variants.ts`, `${name}.stories.tsx`, `${name}.test.tsx`, `${name}.md`, 'index.ts'];

const findings = [];
const report = (file, rule, fix) => findings.push({ file: path.relative(root, file), rule, fix });

/** The folders of one layer, as `{ name, dir }`. */
async function folders(layer) {
  const dir = path.join(src, LAYERS[layer]);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => ({ name: entry.name, layer, dir: path.join(dir, entry.name) }));
}

const parts = [...(await folders('component')), ...(await folders('pattern'))];
const registry = JSON.parse(await readFile(path.join(root, 'component-registry.json'), 'utf8')).components;

// 1. Shape
for (const part of parts) {
  const present = await readdir(part.dir);
  for (const file of FILES(part.name)) {
    if (!present.includes(file)) report(path.join(part.dir, file), 'Shape: the file is missing.', `Add ${file}. Every part has the same six files.`);
  }
  for (const file of present) {
    if (!FILES(part.name).includes(file)) {
      report(path.join(part.dir, file), 'Shape: a part has exactly six files.', 'Move the code into one of the six files, or split it into its own part.');
    }
  }
}

// 2. Registry
const registryFile = path.join(root, 'component-registry.json');
for (const part of parts) {
  const entry = registry.find((candidate) => candidate.name === part.name);
  if (!entry) {
    report(registryFile, `Registry: ${part.name} is not listed.`, 'Add an entry with name, layer, group, description, example and uses.');
    continue;
  }
  if (entry.layer !== part.layer) report(registryFile, `Registry: ${part.name} is listed as a ${entry.layer}.`, `It lives in ${LAYERS[part.layer]}/, so its layer is "${part.layer}".`);
  for (const key of ['group', 'description', 'example', 'uses']) {
    if (entry[key] === undefined || entry[key] === '') report(registryFile, `Registry: ${part.name} has no ${key}.`, `Write its ${key}.`);
  }
  const stories = await readFile(path.join(part.dir, `${part.name}.stories.tsx`), 'utf8').catch(() => '');
  const title = `${part.layer === 'component' ? 'Components' : 'Patterns'}/${entry.group}/${part.name}`;
  if (stories && !stories.includes(`title: '${title}'`)) {
    report(path.join(part.dir, `${part.name}.stories.tsx`), 'Registry: the story title does not match the registry.', `Use title: '${title}', or change the group in the registry.`);
  }
  const barrel = await readFile(path.join(src, LAYERS[part.layer], 'index.ts'), 'utf8');
  if (!barrel.includes(`'./${part.name}/index.js'`)) {
    report(path.join(src, LAYERS[part.layer], 'index.ts'), `Registry: ${part.name} is not exported.`, `Add export * from './${part.name}/index.js'.`);
  }
  // What a part imports from other parts must match what the registry says it uses.
  const sources = await Promise.all([`${part.name}.tsx`, `${part.name}.variants.ts`].map((file) => readFile(path.join(part.dir, file), 'utf8').catch(() => '')));
  const imported = new Set([...sources.join('\n').matchAll(/from '\.\.\/(?:\.\.\/(?:components|patterns)\/)?([A-Z]\w+)\/index\.js'/g)].map((match) => match[1]));
  const listed = new Set(entry.uses ?? []);
  for (const name of imported) if (!listed.has(name)) report(registryFile, `Registry: ${part.name} imports ${name} but does not list it.`, `Add "${name}" to its uses.`);
  for (const name of listed) if (!imported.has(name)) report(registryFile, `Registry: ${part.name} lists ${name} but does not import it.`, `Remove "${name}" from its uses.`);
  if (part.layer === 'component' && [...imported].some((name) => parts.find((other) => other.name === name)?.layer === 'pattern')) {
    report(path.join(part.dir, `${part.name}.tsx`), 'Layers: a component must not import a pattern.', 'Patterns are built from components, not the other way round.');
  }
}
for (const entry of registry) {
  if (!parts.some((part) => part.name === entry.name)) report(registryFile, `Registry: ${entry.name} is listed but has no folder.`, 'Remove the entry, or restore the folder.');
}

// 3. Closed, 4. Variants, 5. Tokens
const design = await loadDesignSystem(await readFile(path.join(src, 'styles.css'), 'utf8'), { base: src });
const known = new Map();
const exists = (name) => {
  if (!known.has(name)) known.set(name, design.candidatesToCss([name])[0] !== null);
  return known.get(name);
};
const strings = (code) => [...code.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g)].map((match) => match[1] ?? match[2] ?? match[3]);
const withoutImports = (code) => code.replace(/^(?:import|export) .* from .*$/gm, '');
const RAW_COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/i;

/** Every class name in a file's strings must come from the theme. `${...}` joins are skipped. */
function checkClasses(file, code) {
  for (const name of strings(code).flatMap((text) => text.split(/\s+/)).filter(Boolean)) {
    if (/\[.*\]/.test(name)) {
      report(file, `Tokens: "${name}" is an arbitrary value.`, 'Use a step from the scale, or add a token to src/tokens/tokens.css.');
    } else if (/[-:]/.test(name) && !name.includes('${') && !exists(name)) {
      report(file, `Tokens: "${name}" is not a class the theme provides.`, "Check the spelling, or use a token from src/styles.css. Tailwind's own colours and sizes are switched off.");
    }
  }
}

for (const part of parts) {
  const component = path.join(part.dir, `${part.name}.tsx`);
  const variants = path.join(part.dir, `${part.name}.variants.ts`);
  const code = existsSync(component) ? await readFile(component, 'utf8') : '';
  const variantCode = existsSync(variants) ? withoutImports(await readFile(variants, 'utf8')) : '';

  const props = code.match(new RegExp(`interface ${part.name}Props[^{]*\\{([\\s\\S]*?)\\n\\}`))?.[1] ?? '';
  if (/\b(?:className|style)\??:/.test(props)) {
    report(component, 'Closed: a part takes no className or style.', 'Add a variant for the look that is needed, so every screen can use it.');
  }
  if (/\.\.\.(?:rest|props|other)\b/.test(code)) {
    report(component, 'Closed: props are not passed through to the element.', 'Name each prop the part accepts.');
  }
  if (/\bstyle=/.test(code)) report(component, 'Tokens: no inline styles.', `Use a class in ${part.name}.variants.ts.`);
  if (/className(?:=|:\s*)\{?\s*['"`]/.test(code)) {
    report(component, 'Variants: class names do not belong in the component file.', `Move them to ${part.name}.variants.ts and import them.`);
  }

  checkClasses(variants, variantCode);
  for (const [file, text] of [[component, code], [variants, variantCode]]) {
    if (RAW_COLOUR.test(text)) report(file, 'Tokens: a raw colour.', 'Use a colour token.');
    if (/\b\d+(?:px|rem|em)\b/.test(text)) report(file, 'Tokens: a raw size.', 'Use a step from the spacing or type scale.');
  }
}
// Class names shared between parts live in files at the root of a layer. They follow the token rules too.
for (const layer of Object.values(LAYERS)) {
  const dir = path.join(src, layer);
  if (!existsSync(dir)) continue;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name === 'index.ts') continue;
    const file = path.join(dir, entry.name);
    const text = withoutImports(await readFile(file, 'utf8'));
    checkClasses(file, text);
    if (RAW_COLOUR.test(text)) report(file, 'Tokens: a raw colour.', 'Use a colour token.');
  }
}

const styles = (await readFile(path.join(src, 'styles.css'), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
if (RAW_COLOUR.test(styles)) report(path.join(src, 'styles.css'), 'Tokens: a raw colour outside src/tokens/.', 'Define it in tokens.css and refer to it by name.');

if (findings.length > 0) {
  for (const finding of findings) console.error(`✗ ${finding.file}\n  ${finding.rule}\n  ${finding.fix}\n`);
  console.error(`${findings.length} design system ${findings.length === 1 ? 'rule is' : 'rules are'} broken.`);
  process.exit(1);
}
console.log(`Design system: ${parts.length} parts follow the rules (${known.size} classes checked against the theme).`);
