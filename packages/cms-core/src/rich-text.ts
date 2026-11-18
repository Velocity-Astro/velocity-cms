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
