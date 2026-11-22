import { isSafeLink, type RichText, type RichTextBlock, type RichTextInline, type RichTextListItem, type RichTextMark } from '@velocity-astro/cms-core';

/** What starts a line of its own. Anything else is part of the line it is in. */
const BLOCKS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'UL', 'OL', 'LI']);
const isElement = (node: Node): node is HTMLElement => node.nodeType === 1;
const isBlock = (node: Node): node is HTMLElement => isElement(node) && BLOCKS.has(node.tagName);

/** The marks an element puts on the words inside it, before those of what is around it: the first is the innermost. */
function marked(element: HTMLElement, marks: readonly RichTextMark[]): readonly RichTextMark[] {
  const has = (type: RichTextMark['type']) => marks.some((mark) => mark.type === type);
  if ((element.tagName === 'B' || element.tagName === 'STRONG') && !has('bold')) return [{ type: 'bold' }, ...marks];
  if ((element.tagName === 'I' || element.tagName === 'EM') && !has('italic')) return [{ type: 'italic' }, ...marks];
  if (element.tagName === 'CODE' && !has('code')) return [{ type: 'code' }, ...marks];
  const href = element.tagName === 'A' ? (element.getAttribute('href') ?? '').trim() : '';
  if (href !== '' && isSafeLink(href) && !has('link')) return [{ type: 'link', attrs: { href } }, ...marks];
  return marks;
}

/** The words and line breaks of one line, each with the marks of everything around it. */
function inlines(nodes: Iterable<Node>, marks: readonly RichTextMark[] = []): RichTextInline[] {
  const found: RichTextInline[] = [];
  for (const node of nodes) {
    if (node.nodeType === 3) {
      // A line of the page's own markup is a space, as a browser shows it.
      const text = (node.nodeValue ?? '').replace(/[\t\n\r ]+/g, ' ');
      if (text !== '') found.push(marks.length > 0 ? { type: 'text', text, marks } : { type: 'text', text });
    } else if (isElement(node)) {
      if (node.tagName === 'BR') found.push({ type: 'hardBreak' });
      else found.push(...inlines(node.childNodes, marked(node, marks)));
    }
  }
  return found;
}

/** A line without the space around it and the break a browser keeps at the end of an empty one. */
function line(parts: RichTextInline[]): RichTextInline[] | undefined {
  // Words that follow each other with the same marks are one run, as the editor keeps them.
  const kept: RichTextInline[] = [];
  for (const part of parts) {
    const last = kept.at(-1);
    if (part.type === 'text' && last?.type === 'text' && JSON.stringify(last.marks ?? []) === JSON.stringify(part.marks ?? [])) kept.splice(-1, 1, { ...last, text: `${last.text}${part.text}`.replace(/ {2,}/g, ' ') });
    else kept.push(part);
  }
  while (kept.at(-1)?.type === 'hardBreak') kept.pop();
  const trim = (at: number, how: (text: string) => string) => {
    const part = kept.at(at);
    if (part?.type !== 'text') return;
    const text = how(part.text);
    if (text === '') kept.splice(at, 1);
    else kept.splice(at, 1, { ...part, text });
  };
  trim(0, (text) => text.replace(/^ +/, ''));
  trim(-1, (text) => text.replace(/ +$/, ''));
  return kept.length > 0 ? kept : undefined;
}

const paragraph = (parts: RichTextInline[]): RichTextBlock => {
  const content = line(parts);
  return content ? { type: 'paragraph', content } : { type: 'paragraph' };
};

function blocks(nodes: Iterable<Node>): RichTextBlock[] {
  const found: RichTextBlock[] = [];
  // Words that stand outside any paragraph are a paragraph of their own.
  let loose: Node[] = [];
  const flush = () => {
    const content = line(inlines(loose));
    if (content) found.push({ type: 'paragraph', content });
    loose = [];
  };
  for (const node of nodes) {
    if (!isBlock(node)) {
      loose.push(node);
      continue;
    }
    flush();
    const tag = node.tagName;
    const holdsBlocks = [...node.childNodes].some(isBlock);
    if (tag === 'UL' || tag === 'OL') {
      const items: RichTextListItem[] = [...node.children]
        .filter((child) => child.tagName === 'LI')
        .map((item) => ({ type: 'listItem', content: within(item) }));
      if (items.length > 0) found.push({ type: tag === 'UL' ? 'bulletList' : 'orderedList', content: items });
    } else if (tag === 'BLOCKQUOTE') {
      found.push({ type: 'blockquote', content: within(node) });
    } else if (holdsBlocks) {
      found.push(...blocks(node.childNodes));
    } else if (/^H[1-6]$/.test(tag)) {
      const content = line(inlines(node.childNodes));
      found.push({ type: 'heading', attrs: { level: tag === 'H1' || tag === 'H2' ? 2 : 3 }, ...(content && { content }) });
    } else {
      found.push(paragraph(inlines(node.childNodes)));
    }
  }
  flush();
  return found;
}

/** What a quote or an item of a list holds: always at least a line, as the format asks. */
function within(element: Element): RichTextBlock[] {
  const found = blocks(element.childNodes);
  return found.length > 0 ? found : [{ type: 'paragraph' }];
}

/**
 * Text written on a page of the site, as the formatted text a field holds. Only what the format
 * keeps comes through: paragraphs, headings, lists, quotes, bold, italics, line breaks and links
 * to where a site may link. Any other markup is dropped and its words kept. Nothing to read is
 * `undefined`.
 */
export function richTextFromHtml(html: string): RichText | undefined {
  const parsed = new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html');
  const content = blocks(parsed.body.childNodes);
  // An empty line at the end is where the caret was, not something written.
  while (content.at(-1)?.type === 'paragraph' && (content.at(-1) as { content?: unknown }).content === undefined) content.pop();
  return content.length > 0 ? { type: 'doc', content } : undefined;
}
