import { z } from 'zod';
import { escapeHtml } from './search-text.js';

/**
 * Formatted text as it is stored: a small tree, not HTML. Nothing in it can be markup, so a
 * page that shows it never has to clean it. The shape is the one ProseMirror-based editors
 * read and write, so the editor needs no translation.
 */
export interface RichText {
  readonly type: 'doc';
  readonly content: readonly RichTextBlock[];
}

export type RichTextMark =
  | { readonly type: 'bold' }
  | { readonly type: 'italic' }
  | { readonly type: 'link'; readonly attrs: { readonly href: string } };

export type RichTextInline =
  | { readonly type: 'text'; readonly text: string; readonly marks?: readonly RichTextMark[] | undefined }
  | { readonly type: 'hardBreak' };

export type RichTextBlock =
  | { readonly type: 'paragraph'; readonly content?: readonly RichTextInline[] | undefined }
  | { readonly type: 'heading'; readonly attrs: { readonly level: 2 | 3 }; readonly content?: readonly RichTextInline[] | undefined }
  | { readonly type: 'blockquote'; readonly content: readonly RichTextBlock[] }
  | { readonly type: 'bulletList' | 'orderedList'; readonly content: readonly RichTextListItem[] };

export interface RichTextListItem {
  readonly type: 'listItem';
  readonly content: readonly RichTextBlock[];
}

/**
 * Where a link may lead: a web address, an email address, a phone number, or a place on this
 * site. Anything else (`javascript:` above all) is refused when the text is saved.
 */
export function isSafeLink(href: string): boolean {
  if (/^(?:https?:\/\/|mailto:|tel:)\S+$/i.test(href)) return true;
  return /^(?:\/(?!\/)|#)\S*$/.test(href);
}

const mark = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bold') }),
  z.object({ type: z.literal('italic') }),
  z.object({
    type: z.literal('link'),
    attrs: z.object({ href: z.string().max(2000).refine(isSafeLink, 'A link must be a web address, an email address, a phone number or a page of this site.') }),
  }),
]);

const inline = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().min(1), marks: z.array(mark).optional() }),
  z.object({ type: z.literal('hardBreak') }),
]);

const block: z.ZodType<RichTextBlock> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('paragraph'), content: z.array(inline).optional() }),
    z.object({ type: z.literal('heading'), attrs: z.object({ level: z.union([z.literal(2), z.literal(3)]) }), content: z.array(inline).optional() }),
    z.object({ type: z.literal('blockquote'), content: z.array(block) }),
    z.object({ type: z.literal('bulletList'), content: z.array(listItem) }),
    z.object({ type: z.literal('orderedList'), content: z.array(listItem) }),
  ]),
);

const listItem: z.ZodType<RichTextListItem> = z.object({ type: z.literal('listItem'), content: z.array(block) });

const MAX_DEPTH = 12;
const depthOf = (node: unknown): number => {
  const content = typeof node === 'object' && node !== null ? (node as { content?: unknown }).content : undefined;
  return Array.isArray(content) ? 1 + Math.max(0, ...content.map(depthOf)) : 1;
};

/**
 * Text that was plain becomes paragraphs, one per line or per item. This is what lets a text
 * field, or a list of paragraphs, be changed to rich text without touching what is stored.
 */
export function fromPlainText(value: string | readonly string[]): RichText {
  const lines = (typeof value === 'string' ? value.split(/\n+/) : value).map((line) => line.trim()).filter((line) => line !== '');
  return { type: 'doc', content: lines.map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line }] })) };
}

const isPlain = (value: unknown): value is string | string[] =>
  typeof value === 'string' || (Array.isArray(value) && value.every((item) => typeof item === 'string'));

/** Checks formatted text, and drops anything an editor added that the format does not keep. */
export const richTextSchema: z.ZodType<RichText> = z.preprocess(
  (value) => (isPlain(value) ? fromPlainText(value) : value),
  z
    .object({ type: z.literal('doc'), content: z.array(block) })
    .refine((doc) => depthOf(doc) <= MAX_DEPTH, 'Lists and quotes are nested too deeply.'),
);

/**
 * What a rich text field may hold beyond paragraphs. A field names the ones the place it is shown
 * was drawn for (`formats`); one that names none takes them all.
 */
export const RICH_TEXT_FORMATS = ['bold', 'italic', 'link', 'headings', 'lists', 'quotes'] as const;
export type RichTextFormat = (typeof RICH_TEXT_FORMATS)[number];

const MARK_FORMAT = { bold: 'bold', italic: 'italic', link: 'link' } as const satisfies Record<RichTextMark['type'], RichTextFormat>;

/**
 * The text with only what `formats` allows: a mark it leaves out is taken off its words, a heading
 * becomes a paragraph, a list gives its items' paragraphs and a quote what it holds. No word is
 * lost. Without `formats`, the text is as it was.
 */
export function limitRichText(text: RichText, formats: readonly RichTextFormat[] | undefined): RichText {
  if (formats === undefined) return text;
  const allowed = new Set<RichTextFormat>(formats);
  const inline = (nodes: readonly RichTextInline[] | undefined): RichTextInline[] | undefined =>
    nodes?.map((node) => {
      if (node.type !== 'text' || node.marks === undefined) return node;
      const marks = node.marks.filter((applied) => allowed.has(MARK_FORMAT[applied.type]));
      return marks.length > 0 ? { ...node, marks } : { type: 'text', text: node.text };
    });
  const blocks = (nodes: readonly (RichTextBlock | RichTextListItem)[]): RichTextBlock[] =>
    nodes.flatMap((node): RichTextBlock[] => {
      if (node.type === 'paragraph') return [{ type: 'paragraph', ...(node.content && { content: inline(node.content) }) }];
      if (node.type === 'heading') {
        const content = inline(node.content);
        return [allowed.has('headings') ? { ...node, ...(content && { content }) } : { type: 'paragraph', ...(content && { content }) }];
      }
      if (node.type === 'blockquote') return allowed.has('quotes') ? [{ type: 'blockquote', content: blocks(node.content) }] : blocks(node.content);
      if (node.type === 'listItem') return blocks(node.content);
      if (allowed.has('lists')) return [{ type: node.type, content: node.content.map((item) => ({ type: 'listItem', content: blocks(item.content) })) }];
      return blocks(node.content);
    });
  return { type: 'doc', content: blocks(text.content) };
}

const TAGS = { bold: 'strong', italic: 'em' } as const;

function inlineHtml(nodes: readonly RichTextInline[] | undefined): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === 'hardBreak') return '<br>';
      return (node.marks ?? []).reduce((html, applied) => {
        if (applied.type !== 'link') return `<${TAGS[applied.type]}>${html}</${TAGS[applied.type]}>`;
        // Checked again here: what is stored may be older than the rule.
        if (!isSafeLink(applied.attrs.href)) return html;
        const outside = /^https?:/i.test(applied.attrs.href) ? ' rel="noopener noreferrer"' : '';
        return `<a href="${escapeHtml(applied.attrs.href)}"${outside}>${html}</a>`;
      }, escapeHtml(node.text));
    })
    .join('');
}

function blockHtml(node: RichTextBlock | RichTextListItem): string {
  const inside = (content: readonly (RichTextBlock | RichTextListItem)[]) => content.map(blockHtml).join('');
  if (node.type === 'paragraph') return `<p>${inlineHtml(node.content)}</p>`;
  if (node.type === 'heading') return `<h${node.attrs.level}>${inlineHtml(node.content)}</h${node.attrs.level}>`;
  if (node.type === 'blockquote') return `<blockquote>${inside(node.content)}</blockquote>`;
  if (node.type === 'bulletList') return `<ul>${inside(node.content)}</ul>`;
  if (node.type === 'orderedList') return `<ol>${inside(node.content)}</ol>`;
  return `<li>${inside(node.content)}</li>`;
}

/** The text as HTML a page can show as it is. Every word and address in it is escaped. */
export function richTextHtml(text: RichText): string {
  return text.content.map(blockHtml).join('');
}

function blockLines(node: RichTextBlock | RichTextListItem): string[] {
  if (node.type === 'paragraph' || node.type === 'heading') {
    const line = (node.content ?? []).map((part) => (part.type === 'text' ? part.text : ' ')).join('').trim();
    return line === '' ? [] : [line];
  }
  return node.content.flatMap(blockLines);
}

/** The words alone, one entry per paragraph, heading or list item: for descriptions, search and titles. */
export function richTextParagraphs(text: RichText): string[] {
  return text.content.flatMap(blockLines);
}

/** Whether there is anything to read in it. */
export const isEmptyRichText = (text: RichText): boolean => richTextParagraphs(text).length === 0;

/**
 * Markdown, as an agent, an import or a person writes it, turned into formatted text. Only what
 * the format keeps is read: paragraphs, headings (`#` to `###`, kept at level 2 or 3), quotes,
 * bulleted and numbered lists (nested by indenting), bold, italics and links. Anything else is
 * kept as its words, except pictures, which formatted text cannot hold and are left out. A link
 * that is not safe keeps its words and loses the link.
 */
export function richTextFromMarkdown(markdown: string): RichText {
  return { type: 'doc', content: markdownBlocks(markdown.replace(/\r\n?/g, '\n').split('\n')) };
}

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

function markdownBlocks(lines: readonly string[]): RichTextBlock[] {
  const blocks: RichTextBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    const text = paragraph.join('\n').trim();
    const content = text === '' ? [] : markdownInline(text);
    if (content.length > 0) blocks.push({ type: 'paragraph', content });
    paragraph = [];
  };
  for (let at = 0; at < lines.length; at++) {
    const line = lines[at] ?? '';
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (line.trim() === '') {
      flush();
    } else if (heading) {
      flush();
      blocks.push({ type: 'heading', attrs: { level: (heading[1]?.length ?? 2) >= 3 ? 3 : 2 }, content: markdownInline(heading[2] ?? '') });
    } else if (/^\s*>/.test(line)) {
      flush();
      const quoted: string[] = [];
      while (at < lines.length && /^\s*>/.test(lines[at] ?? '')) quoted.push((lines[at++] ?? '').replace(/^\s*>\s?/, ''));
      at--;
      blocks.push({ type: 'blockquote', content: markdownBlocks(quoted) });
    } else if (LIST_ITEM.test(line)) {
      flush();
      const taken: string[] = [];
      while (at < lines.length && (LIST_ITEM.test(lines[at] ?? '') || /^\s{2,}\S/.test(lines[at] ?? ''))) taken.push(lines[at++] ?? '');
      at--;
      blocks.push(markdownList(taken));
    } else if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flush();
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

function markdownList(lines: readonly string[]): RichTextBlock {
  const first = LIST_ITEM.exec(lines[0] ?? '');
  const indent = first?.[1]?.length ?? 0;
  const ordered = /\d/.test(first?.[2] ?? '');
  const items: { text: string; inner: string[] }[] = [];
  for (const line of lines) {
    const item = LIST_ITEM.exec(line);
    if (item && (item[1]?.length ?? 0) <= indent) items.push({ text: item[3] ?? '', inner: [] });
    else items.at(-1)?.inner.push(line.slice(Math.min(indent + 2, line.length - line.trimStart().length)));
  }
  return {
    type: ordered ? 'orderedList' : 'bulletList',
    content: items.map(({ text, inner }) => ({ type: 'listItem', content: [{ type: 'paragraph', content: markdownInline(text) }, ...markdownBlocks(inner)] })),
  };
}

function markdownInline(text: string): RichTextInline[] {
  const parts: RichTextInline[] = [];
  const add = (words: string, marks: readonly RichTextMark[]) => {
    const lines = words.split('\n');
    lines.forEach((line, index) => {
      if (index > 0) parts.push({ type: 'hardBreak' });
      if (line !== '') parts.push(marks.length > 0 ? { type: 'text', text: line, marks } : { type: 'text', text: line });
    });
  };
  const walk = (rest: string, marks: readonly RichTextMark[]) => {
    const pattern = /!\[[^\]]*\]\([^)]*\)|\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*|_(.+?)_|`([^`]+)`/;
    while (rest !== '') {
      const found = pattern.exec(rest);
      if (!found) return add(rest, marks);
      add(rest.slice(0, found.index), marks);
      const [, label, href, strong, strongToo, em, emToo, code] = found;
      if (found[0].startsWith('![')) {
        // A picture has no place in formatted text: it is left out, and an import says so.
      } else if (label !== undefined && href !== undefined) walk(label, isSafeLink(href) ? [...marks, { type: 'link', attrs: { href } }] : marks);
      else if (strong !== undefined || strongToo !== undefined) walk(strong ?? strongToo ?? '', [...marks, { type: 'bold' }]);
      else if (em !== undefined || emToo !== undefined) walk(em ?? emToo ?? '', [...marks, { type: 'italic' }]);
      else add(code ?? '', marks);
      rest = rest.slice(found.index + found[0].length);
    }
  };
  walk(text, []);
  return parts;
}
