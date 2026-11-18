import { beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from './access.js';
import { createCms, type Cms } from './cms.js';
import { ValidationError } from './errors.js';
import { defineBlock, type NewBlock } from './fields/index.js';
import type { BlockDef, ContentTypeDef } from './model.js';
import { FakeClock, InMemoryEntryRepository, InMemorySchemaRepository, SequentialIds } from './testing/index.js';

const owner: Actor = { kind: 'user', id: 'maya', role: 'owner' };
const editor: Actor = { kind: 'user', id: 'daniel', role: 'editor' };

const hero = defineBlock({
  key: 'hero',
  label: { en: 'Hero' },
  icon: 'layout-template',
  group: 'Opening',
  fields: [
    { key: 'title', type: 'text', label: { en: 'Title' }, required: true },
    { key: 'tone', type: 'select', label: { en: 'Tone' }, options: { choices: ['default', 'invert'] } },
  ],
});
const faq = defineBlock({
  key: 'faq',
  label: { en: 'Questions' },
  fields: [
    {
      key: 'items',
      type: 'list',
      label: { en: 'Questions' },
      options: {
        of: {
          type: 'group',
          options: {
            fields: [
              { key: 'question', type: 'text', label: { en: 'Question' }, required: true },
              { key: 'answer', type: 'text', label: { en: 'Answer' } },
            ],
          },
        },
      },
    },
  ],
});

let cms: Cms;
let pages: ContentTypeDef;

const describePages = (blocks: readonly NewBlock[], settings: Record<string, unknown> = {}) =>
  cms.schema.define(owner, {
    key: 'pages',
    kind: 'collection',
    label: { en: 'Pages' },
    fields: [{ key: 'body', type: 'blocks', label: { en: 'Sections' }, options: { blocks, ...settings } }],
  });

const body = (type: ContentTypeDef) => {
  const field = type.fields.find((candidate) => candidate.key === 'body');
  if (!field) throw new Error('No body');
  return field;
};
const block = (type: ContentTypeDef, key: string): BlockDef => {
  const found = (body(type).options['blocks'] as BlockDef[]).find((candidate) => candidate.key === key);
  if (!found) throw new Error(`No block "${key}"`);
  return found;
};
const fieldId = (def: BlockDef, key: string): string => {
  const field = def.fields.find((candidate) => candidate.key === key && candidate.deletedAt === undefined);
  if (!field) throw new Error(`No field "${key}"`);
  return field.id;
};

beforeEach(async () => {
  cms = createCms({ entries: new InMemoryEntryRepository(), types: new InMemorySchemaRepository(), clock: new FakeClock(), ids: new SequentialIds() });
  pages = await describePages([hero, faq]);
});

describe('describing blocks', () => {
  it('gives each block and each of its fields a permanent id', () => {
    const stored = block(pages, 'hero');
    expect(stored).toMatchObject({ key: 'hero', label: { en: 'Hero' }, icon: 'layout-template', group: 'Opening' });
    expect(stored.id).toEqual(expect.any(String));
    expect(stored.fields.map((field) => field.key)).toEqual(['title', 'tone']);
    expect(new Set([stored.id, ...stored.fields.map((field) => field.id), block(pages, 'faq').id]).size).toBe(4);
  });

  it('keeps every id when the blocks are described again, whatever else changes', async () => {
    const again = await describePages([faq, { ...hero, key: 'hero', label: { en: 'Page opening' }, fields: [...(hero.fields ?? []), { key: 'lead', type: 'text', label: { en: 'Lead' } }] }]);
    expect(block(again, 'hero').id).toBe(block(pages, 'hero').id);
    expect(block(again, 'hero').label).toEqual({ en: 'Page opening' });
    expect(fieldId(block(again, 'hero'), 'title')).toBe(fieldId(block(pages, 'hero'), 'title'));
    expect(block(again, 'hero').fields.map((field) => field.key)).toEqual(['title', 'tone', 'lead']);
    expect((body(again).options['blocks'] as BlockDef[]).map((def) => def.key)).toEqual(['faq', 'hero']);
  });

  it('retires a block the description leaves out, and brings it back with the same id', async () => {
    const without = await describePages([hero]);
    expect(block(without, 'faq').retiredAt).toEqual(expect.any(String));
    const back = await describePages([hero, faq]);
    expect(block(back, 'faq').retiredAt).toBeUndefined();
    expect(block(back, 'faq').id).toBe(block(pages, 'faq').id);
  });

  it('marks a field a block no longer has as removed, keeping its id', async () => {
    const title = fieldId(block(pages, 'hero'), 'title');
    const slimmer = await describePages([{ ...hero, fields: (hero.fields ?? []).filter((field) => field.key !== 'tone') }, faq]);
    const fields = block(slimmer, 'hero').fields;
    expect(fields.find((field) => field.key === 'tone')?.deletedAt).toEqual(expect.any(String));
    expect(fields.find((field) => field.key === 'title')).toMatchObject({ id: title });
  });

  it('stays as it is when the field is changed in the builder', async () => {
    const changed = await cms.schema.changeField(owner, pages.id, body(pages).id, { label: { en: 'Page sections' } });
    expect(body(changed).options).toEqual(body(pages).options);
    const retired = await describePages([hero]);
    const relabelled = await cms.schema.changeField(owner, retired.id, body(retired).id, { label: { en: 'Page sections' } });
    expect(block(relabelled, 'faq').retiredAt).toEqual(expect.any(String));
  });

  it('refuses a key code could not use, two blocks with one key, and a block with no name', async () => {
    expect(() => defineBlock({ key: 'Hero block', label: { en: 'Hero' } })).toThrow(ValidationError);
    await expect(describePages([hero, hero])).rejects.toThrow(/Two blocks have the key "hero"/);
    await expect(describePages([{ key: 'plain', label: {} }])).rejects.toThrow(/Give the block "plain" a name/);
  });
});

describe('a page made of sections', () => {
  const sections = (type: ContentTypeDef = pages) => {
    const heroDef = block(type, 'hero');
    const faqDef = block(type, 'faq');
    const items = faqDef.fields[0];
    if (!items) throw new Error('No items');
    const [question, answer] = (items.options['of'] as { options: { fields: { id: string }[] } }).options.fields.map((field) => field.id) as [string, string];
    return {
      hero: (id: string, data: Record<string, unknown>) => ({ id, block: heroDef.id, data: Object.fromEntries(Object.entries(data).map(([key, value]) => [fieldId(heroDef, key), value])) }),
      faq: (id: string, list: { question?: string; answer?: string }[]) => ({
        id,
        block: faqDef.id,
        data: { [items.id]: list.map((item) => ({ ...(item.question !== undefined && { [question]: item.question }), ...(item.answer !== undefined && { [answer]: item.answer }) })) },
      }),
    };
  };
  const create = (value: unknown, type: ContentTypeDef = pages) =>
    cms.content.create(editor, { typeId: type.id, locale: 'en', slug: 'about', data: { [body(type).id]: value } });

  it('saves sections in order and hands the site each block by key with its values by key', async () => {
    const make = sections();
    const entry = await create([make.hero('s1', { title: 'About us', tone: 'invert' }), make.faq('s2', [{ question: 'Where are you?', answer: 'Austin' }])]);
    expect(cms.content.toPublic(pages, entry, 'working').data).toEqual({
      body: [
        { id: 's1', block: 'hero', data: { title: 'About us', tone: 'invert' } },
        { id: 's2', block: 'faq', data: { items: [{ question: 'Where are you?', answer: 'Austin' }] } },
      ],
    });
  });

  it('refuses a value a block does not accept even in a draft, naming it by section and key', async () => {
    const make = sections();
    await expect(create([make.hero('s1', { title: 'About us' }), make.hero('s2', { tone: 'loud' })])).rejects.toMatchObject({
      issues: [{ path: ['body', 1, 'tone'] }],
    });
  });

  it('lets a draft leave a required field of a section empty, and refuses to publish until it is filled', async () => {
    const make = sections();
    const entry = await create([make.hero('s1', {}), make.faq('s2', [{ answer: 'Austin' }])]);
    await expect(cms.content.publish(editor, entry.id)).rejects.toMatchObject({
      issues: [
        { path: ['body', 0, 'title'], message: 'Fill this in before publishing.' },
        { path: ['body', 1, 'items', 0, 'question'], message: 'Fill this in before publishing.' },
      ],
    });
  });

  it('refuses a section of a block the field does not allow, and two sections with one id', async () => {
    const make = sections();
    await expect(create([{ id: 's1', block: 'nope', data: {} }])).rejects.toMatchObject({ issues: [{ path: ['body', 0, 'block'] }] });
    await expect(create([make.hero('s1', { title: 'One' }), make.hero('s1', { title: 'Two' })])).rejects.toMatchObject({ issues: [{ path: ['body', 1, 'id'] }] });
  });

  it('keeps to the least and most sections the field allows', async () => {
    const limited = await describePages([hero, faq], { max: 1 });
    const make = sections(limited);
    await expect(create([make.hero('s1', { title: 'One' }), make.hero('s2', { title: 'Two' })], limited)).rejects.toBeInstanceOf(ValidationError);
  });

  it('keeps a hidden section in the entry and leaves it off the site', async () => {
    const make = sections();
    const entry = await create([{ ...make.hero('s1', { title: 'About us' }), hidden: true }, make.hero('s2', { title: 'Shown' })]);
    expect(entry.data[body(pages).id]).toHaveLength(2);
    expect(cms.content.toPublic(pages, entry, 'working').data['body']).toEqual([{ id: 's2', block: 'hero', data: { title: 'Shown' } }]);
  });

  it('keeps the sections of a retired block through later saves, off the site, and shows them again when the block is back', async () => {
    const make = sections();
    const entry = await create([make.hero('s1', { title: 'About us' }), make.faq('s2', [{ question: 'Where?' }])]);
    const without = await describePages([hero]);
    expect(cms.content.toPublic(without, entry, 'working').data['body']).toEqual([{ id: 's1', block: 'hero', data: { title: 'About us' } }]);
    const saved = await cms.content.update(editor, entry.id, { data: entry.data, expectedRevision: entry.revision });
    expect(saved.data[body(without).id]).toEqual(entry.data[body(pages).id]);
    await cms.content.publish(editor, entry.id);
    const back = await describePages([hero, faq]);
    expect(cms.content.toPublic(back, saved, 'working').data['body']).toHaveLength(2);
  });

  it('carries the value of a field a block no longer has, and leaves it off the site', async () => {
    const make = sections();
    const entry = await create([make.hero('s1', { title: 'About us', tone: 'invert' })]);
    const slimmer = await describePages([{ ...hero, fields: (hero.fields ?? []).filter((field) => field.key !== 'tone') }, faq]);
    const saved = await cms.content.update(editor, entry.id, { data: entry.data, expectedRevision: entry.revision });
    expect(saved.data[body(slimmer).id]).toEqual(entry.data[body(pages).id]);
    expect(cms.content.toPublic(slimmer, saved, 'working').data['body']).toEqual([{ id: 's1', block: 'hero', data: { title: 'About us' } }]);
  });
});
