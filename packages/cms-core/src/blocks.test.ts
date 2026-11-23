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

  it('is the template\'s, so the builder leaves it as described', async () => {
    await expect(cms.schema.changeField(owner, pages.id, body(pages).id, { label: { en: 'Page sections' } })).rejects.toThrowError(/comes from the site's template/);
    const retired = await describePages([hero]);
    expect(block(retired, 'faq').retiredAt).toEqual(expect.any(String));
    expect(body(await cms.schema.get(pages.id)).options).toEqual(body(retired).options);
  });

  it('refuses a key code could not use, two blocks with one key, and a block with no name', async () => {
    expect(() => defineBlock({ key: 'Hero block', label: { en: 'Hero' } })).toThrow(ValidationError);
    await expect(describePages([hero, hero])).rejects.toThrow(/Two blocks have the key "hero"/);
    await expect(describePages([{ key: 'plain', label: {} }])).rejects.toThrow(/Give the block "plain" a name/);
  });

  it('keeps a block\'s picture when it is a path on the site, and refuses any other address', async () => {
    const pictured = await describePages([{ ...hero, thumbnail: '/cms/blocks/hero.webp' }, faq]);
    expect([block(pictured, 'hero').thumbnail, block(pictured, 'faq').thumbnail]).toEqual(['/cms/blocks/hero.webp', undefined]);
    // A description without the picture takes it away again.
    expect(block(await describePages([hero, faq]), 'hero').thumbnail).toBeUndefined();
    for (const thumbnail of ['https://elsewhere.example/hero.webp', '//elsewhere.example/hero.webp', 'hero.webp', '/\\elsewhere.example', '/a b.webp', '']) {
      await expect(describePages([{ ...hero, thumbnail }])).rejects.toThrow(/The picture of the block "hero" must be a path on the site/);
    }
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

describe('sections inside a section', () => {
  const text = defineBlock({ key: 'text', label: { en: 'Text' }, fields: [{ key: 'words', type: 'text', label: { en: 'Words' }, required: true }] });
  const columns = defineBlock({
    key: 'columns',
    label: { en: 'Columns' },
    fields: [
      { key: 'left', type: 'blocks', label: { en: 'Left' }, options: { blocks: [text], max: 2 } },
      { key: 'right', type: 'blocks', label: { en: 'Right' }, options: { blocks: [text] } },
    ],
  });
  const inner = (type: ContentTypeDef, side: string) => {
    const columnsDef = block(type, 'columns');
    const field = columnsDef.fields.find((candidate) => candidate.key === side);
    if (!field) throw new Error(`No "${side}"`);
    const textDef = (field.options['blocks'] as BlockDef[])[0];
    if (!textDef) throw new Error('No text block');
    return { columnsDef, field, textDef, words: fieldId(textDef, 'words') };
  };
  const page = (type: ContentTypeDef, left: unknown[], right: unknown[] = []) => {
    const a = inner(type, 'left');
    const b = inner(type, 'right');
    return [{ id: 'row', block: a.columnsDef.id, data: { [a.field.id]: left, ...(right.length > 0 && { [b.field.id]: right }) } }];
  };
  const create = (type: ContentTypeDef, value: unknown) => cms.content.create(editor, { typeId: type.id, locale: 'en', slug: 'home', data: { [body(type).id]: value } });

  it('gives the blocks of an inner place their own ids, kept when described again', async () => {
    const first = await describePages([columns]);
    const again = await describePages([columns]);
    expect(inner(again, 'left').textDef.id).toBe(inner(first, 'left').textDef.id);
    expect(inner(again, 'left').words).toBe(inner(first, 'left').words);
    expect(inner(first, 'left').textDef.id).not.toBe(inner(first, 'right').textDef.id);
  });

  it('saves inner sections and hands the site each by its block\'s key', async () => {
    const type = await describePages([columns]);
    const left = inner(type, 'left');
    const right = inner(type, 'right');
    const entry = await create(type, page(type, [{ id: 'a', block: left.textDef.id, data: { [left.words]: 'On the left' } }], [{ id: 'b', block: right.textDef.id, data: { [right.words]: 'On the right' }, hidden: true }]));
    expect(cms.content.toPublic(type, entry, 'working').data).toEqual({
      body: [{ id: 'row', block: 'columns', data: { left: [{ id: 'a', block: 'text', data: { words: 'On the left' } }], right: [] } }],
    });
  });

  it('checks an inner section as any other: its block, its values and how many its place takes', async () => {
    const type = await describePages([columns]);
    const left = inner(type, 'left');
    const one = (id: string) => ({ id, block: left.textDef.id, data: { [left.words]: 'Words' } });
    await expect(create(type, page(type, [{ id: 'a', block: 'nothing', data: {} }]))).rejects.toThrow(ValidationError);
    await expect(create(type, page(type, [{ id: 'a', block: left.textDef.id, data: { [left.words]: 7 } }]))).rejects.toThrow(ValidationError);
    await expect(create(type, page(type, [one('a'), one('b'), one('c')]))).rejects.toThrow(ValidationError);
  });
});
