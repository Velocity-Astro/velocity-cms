import { liveFields, type Actor, type BlockDef, type Cms, type LocalizedText } from '@velocity-astro/cms-core';
import { SHIPPED_SKILLS, type ShippedSkill } from './skills.generated.js';

/**
 * The skills the MCP server publishes beside its tools ("Skills over MCP", the protocol's
 * `io.modelcontextprotocol/skills` extension). A tool says what can be done; a skill is the
 * playbook for a whole job (build a page, write and publish, follow up on leads, bring content
 * in), so an app that was only given the site's address already knows how to work here.
 *
 * Each is a `SKILL.md` in this package's `skills/` folder, put into `skills.generated.ts` ahead
 * of time because this package reads no files. A skill holds no rule: the tools it names check
 * everything again. What is listed follows what the asker may do, as the list of tools does, and
 * the skills about content end with what this site has today (its types, its blocks, whether
 * this connection may publish), so the playbook is about this site and not any site.
 */

/** The extension's name, as a server declares it in its capabilities. */
export const SKILLS_EXTENSION = 'io.modelcontextprotocol/skills';

/** A skill as the extension lists it: where its `SKILL.md` is, what its frontmatter says, and every file it has. */
export interface ListedSkill {
  readonly uri: string;
  readonly frontmatter: { readonly name: string; readonly description: string };
  readonly resources: readonly { readonly uri: string; readonly digest: string; readonly size: number }[];
}

/** A skill ready to hand over: how it is listed, and its text. */
export interface ServedSkill {
  readonly listed: ListedSkill;
  readonly text: string;
}

/** The skills about people: listed only to whoever may read contacts or what forms received. */
const PERSONAL_SKILLS: ReadonlySet<string> = new Set(['cms-follow-up-leads']);
/** The skills about content, which end with what this site has. A skill about the site's code does not. */
const SITE_SKILLS: ReadonlySet<string> = new Set(['cms-build-page', 'cms-write-content', 'cms-bring-content-in']);

const uriOf = (name: string): string => `skill://${name}/SKILL.md`;
const say = (text: LocalizedText | undefined, locale: string): string | undefined => text?.[locale] ?? Object.values(text ?? {})[0];
/** A label as one line of Markdown that can start nothing: a site's labels are a person's words. */
const plain = (text: string | undefined): string => (text ?? '').replace(/[\r\n`*_[\]<>#|\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

async function digest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const hash = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return `sha256:${[...hash].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** What the site has today, as the last part of a skill about content. */
async function onThisSite(skill: ShippedSkill, cms: Cms, actor: Actor, locale: string): Promise<string> {
  const types = await cms.schema.list();
  const lines: string[] = [];
  if (skill.name === 'cms-build-page') {
    for (const type of types) {
      for (const field of liveFields(type.fields).filter((one) => one.type === 'blocks')) {
        const blocks = ((field.options as { blocks?: readonly BlockDef[] }).blocks ?? []).filter((block) => block.retiredAt === undefined);
        if (blocks.length === 0) continue;
        lines.push(`- \`${type.key}\` (${plain(say(type.label, locale))}), field \`${field.key}\`: ${blocks.map((block) => `\`${block.key}\` (${plain(say(block.label, locale))})`).join(', ')}.`);
      }
    }
    if (lines.length > 0) lines.unshift('Pages are built from these blocks today. `list_blocks` has each one\'s fields:', '');
    else lines.push('No content type of this site is built from sections yet, so there is no page to build this way. Say so, and use the `cms-write-content` skill for its entries.');
  } else {
    for (const type of types) {
      const place = type.inSettings ? ', a page of the settings' : type.sitePart ? ', a part every page shows' : type.kind === 'single' ? ', a single page' : '';
      lines.push(`- \`${type.key}\` (${plain(say(type.label, locale))}${place})`);
    }
    if (lines.length > 0) lines.unshift('The content types today. `get_content_type` has each one\'s fields:', '');
  }
  const publishes = cms.access.can(actor, 'entry:publish');
  lines.push(
    '',
    publishes
      ? 'This connection may publish. Publish only when the person has seen the draft and said so.'
      : 'This connection may not publish. Leave everything a draft and tell the person it is ready to publish in the editor.',
  );
  return `${skill.text.trimEnd()}\n\n## On this site\n\n${lines.join('\n').trim()}\n`;
}

/** Every skill the asker is offered, as it stands for this site now. */
export async function skillsFor(cms: Cms, actor: Actor, locale: string): Promise<ServedSkill[]> {
  const personal = cms.access.can(actor, 'contact:read') || cms.access.can(actor, 'submission:read');
  const offered = SHIPPED_SKILLS.filter((skill) => personal || !PERSONAL_SKILLS.has(skill.name));
  return Promise.all(
    offered.map(async (skill) => {
      const text = SITE_SKILLS.has(skill.name) ? await onThisSite(skill, cms, actor, locale) : skill.text;
      const bytes = new TextEncoder().encode(text);
      const uri = uriOf(skill.name);
      return { text, listed: { uri, frontmatter: { name: skill.name, description: skill.description }, resources: [{ uri, digest: await digest(bytes), size: bytes.byteLength }] } };
    }),
  );
}
