import { describe, expect, it } from 'vitest';
import { createFieldRegistry } from './fields/index.js';
import { fromPlainText, isEmptyRichText, isSafeLink, richTextHtml, richTextParagraphs, richTextSchema, type RichText } from './rich-text.js';

const text = (words: string, ...marks: object[]) => ({ type: 'text', text: words, ...(marks.length > 0 && { marks }) });
const sample = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [text('The house')] },
    { type: 'paragraph', content: [text('Four bedrooms & a '), text('porch', { type: 'bold' }, { type: 'italic' }), { type: 'hardBreak' }, text('See the tour', { type: 'link', attrs: { href: 'https://example.com/tour?a=1&b=2' } })] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [text('Lake <view>')] }] }] },
    { type: 'blockquote', content: [{ type: 'paragraph', content: [text('Home.', { type: 'link', attrs: { href: '/contact/' } })] }] },
    { type: 'paragraph' },
  ],
};

describe('richTextSchema', () => {
  it('takes every kind of block and mark, and gives it back unchanged', () => {
    expect(richTextSchema.parse(sample)).toEqual(sample);
  });

  it("drops what an editor adds that the format does not keep", () => {
    const fromEditor = {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { textAlign: null }, content: [text('Hi', { type: 'link', attrs: { href: '/a', target: '_blank', class: 'x', rel: null } })] }],
    };
    expect(richTextSchema.parse(fromEditor)).toEqual({ type: 'doc', content: [{ type: 'paragraph', content: [text('Hi', { type: 'link', attrs: { href: '/a' } })] }] });
  });

  it('refuses a kind of block or mark it does not know, and a heading the page has no place for', () => {
    const doc = (block: object) => ({ type: 'doc', content: [block] });
    expect(richTextSchema.safeParse(doc({ type: 'image', attrs: { src: 'x' } })).success).toBe(false);
    expect(richTextSchema.safeParse(doc({ type: 'paragraph', content: [text('x', { type: 'code' })] })).success).toBe(false);
    expect(richTextSchema.safeParse(doc({ type: 'heading', attrs: { level: 1 }, content: [text('x')] })).success).toBe(false);
    expect(richTextSchema.safeParse({ type: 'paragraph' }).success).toBe(false);
  });

  it('refuses a link that runs a script or leaves by a side door', () => {
    for (const href of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>', '//evil.test/x', 'vbscript:x', ' https://a.test', 'https://a.test/ x', '']) {
      expect([href, isSafeLink(href)]).toEqual([href, false]);
    }
    for (const href of ['https://example.com/a?b=c#d', 'http://example.com', 'mailto:maya@example.com', 'tel:+15125550100', '/listings/lake-house/', '#features']) {
      expect([href, isSafeLink(href)]).toEqual([href, true]);
    }
    const result = richTextSchema.safeParse({ type: 'doc', content: [{ type: 'paragraph', content: [text('x', { type: 'link', attrs: { href: 'javascript:alert(1)' } })] }] });
    expect(result.error?.issues[0]?.message).toContain('A link must be');
  });

  it('refuses a tree nested deeper than any text is', () => {
    let block: object = { type: 'paragraph', content: [text('x')] };
    for (let depth = 0; depth < 14; depth += 1) block = { type: 'blockquote', content: [block] };
    expect(richTextSchema.safeParse({ type: 'doc', content: [block] }).success).toBe(false);
  });

  it('reads plain text and a list of paragraphs as paragraphs', () => {
    const paragraphs = { type: 'doc', content: [{ type: 'paragraph', content: [text('One')] }, { type: 'paragraph', content: [text('Two')] }] };
    expect(richTextSchema.parse(['One', ' Two ', ''])).toEqual(paragraphs);
    expect(richTextSchema.parse('One\n\nTwo\n')).toEqual(paragraphs);
    expect(fromPlainText('')).toEqual({ type: 'doc', content: [] });
  });
});

describe('what the site receives', () => {
  const parsed = richTextSchema.parse(sample);

  it('is HTML with every word and address escaped', () => {
    expect(richTextHtml(parsed)).toBe(
      '<h2>The house</h2>' +
        '<p>Four bedrooms &amp; a <em><strong>porch</strong></em><br><a href="https://example.com/tour?a=1&amp;b=2" rel="noopener noreferrer">See the tour</a></p>' +
        '<ul><li><p>Lake &lt;view&gt;</p></li></ul>' +
        '<blockquote><p><a href="/contact/">Home.</a></p></blockquote>' +
        '<p></p>',
    );
  });

  it('leaves out a stored link that would not be allowed today, and keeps its words', () => {
    const old = { type: 'doc', content: [{ type: 'paragraph', content: [text('Click', { type: 'link', attrs: { href: 'javascript:alert(1)' } })] }] } as RichText;
    expect(richTextHtml(old)).toBe('<p>Click</p>');
  });

  it('gives the words alone, a paragraph at a time', () => {
    expect(richTextParagraphs(parsed)).toEqual(['The house', 'Four bedrooms & a porch See the tour', 'Lake <view>', 'Home.']);
    expect(isEmptyRichText(parsed)).toBe(false);
    expect(isEmptyRichText({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe(true);
  });

  it('comes from the field type, for text saved before the field was rich text too', () => {
    const field = createFieldRegistry().get('richtext');
    const context = { fields: createFieldRegistry(), mode: 'draft' as const };
    expect(field.editor).toBe('rich-text');
    expect(field.toPublic(parsed, {}, context)).toMatchObject({ paragraphs: ['The house', 'Four bedrooms & a porch See the tour', 'Lake <view>', 'Home.'] });
    expect(field.toPublic(['One', 'Two'], {}, context)).toEqual({ html: '<p>One</p><p>Two</p>', paragraphs: ['One', 'Two'] });
  });
});

describe('Markdown', () => {
  it('reads paragraphs, headings, lists, quotes, bold, italics and safe links, and leaves pictures out', async () => {
    const { richTextFromMarkdown, richTextHtml } = await import('./rich-text.js');
    const text = richTextFromMarkdown('# Title\n\nA **bold** and *slanted* [link](https://example.com) and [bad](javascript:void).\n\n- one\n- two\n  - inner\n\n1. first\n\n> quoted\n\n![photo](/a.jpg)');
    expect(richTextHtml(text)).toBe(
      '<h2>Title</h2><p>A <strong>bold</strong> and <em>slanted</em> <a href="https://example.com" rel="noopener noreferrer">link</a> and bad.</p><ul><li><p>one</p></li><li><p>two</p><ul><li><p>inner</p></li></ul></li></ul><ol><li><p>first</p></li></ol><blockquote><p>quoted</p></blockquote>',
    );
  });
});
