import {
  embedSource,
  isSafeLink,
  richTextParagraphs,
  type EmbedProvider,
  type RichText,
  type RichTextBlock,
  type RichTextImageSize,
  type RichTextInline,
  type RichTextLinkAttrs,
  type RichTextListItem,
  type RichTextMark,
  type RichTextParagraph,
  type RichTextTable,
} from './rich-text.js';
import { escapeHtml } from './search-text.js';

/** A class from a look's name. The schema lets only look names through; this keeps any other text out of an attribute. */
const cls = (name: string): string => escapeHtml(name);

/** A picture of the text as the page can load it. */
export interface ResolvedImage {
  readonly src: string;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  /** Smaller copies, as `srcset` takes them, when the site makes them. */
  readonly srcset?: string | undefined;
}

/**
 * What only the site knows when it draws a page: where an entry is today, in the page's
 * language, and where a picture is loaded from. Text drawn without them leaves out a link to an
 * entry (keeping its words) and a picture.
 */
export interface RichTextResolvers {
  readonly entryHref?: ((type: string, entry: string) => string | undefined) | undefined;
  readonly image?: ((name: string) => ResolvedImage | undefined) | undefined;
}

/** A heading of the text, for a list of what is on the page that links to each. */
export interface RichTextHeadingLink {
  readonly level: 2 | 3 | 4;
  readonly text: string;
  /** The heading's `id` in `html`: lower case, punctuation dropped, spaces as dashes, as GitHub makes them. */
  readonly id: string;
}

/**
 * The text a piece at a time, for a template that draws some kinds with its own components (a
 * picture with `astro:assets`, code coloured by Shiki). Each piece holds its `html` as the CMS
 * draws it, so a template draws only the kinds it wants and writes the rest as they are. Text
 * between those kinds (paragraphs, headings, lists, quotes, dividers) is one `prose` piece.
 */
export type RichTextPart =
  | { readonly kind: 'prose'; readonly html: string }
  | {
      readonly kind: 'image';
      readonly html: string;
      readonly image: string;
      readonly alt: string;
      readonly caption?: string | undefined;
      readonly href?: string | undefined;
      readonly size: 'text' | RichTextImageSize;
      /** Where the CMS loads it from; left out when the site has no such image. */
      readonly src?: ResolvedImage | undefined;
    }
  | { readonly kind: 'table'; readonly html: string; readonly style?: string | undefined; readonly rows: readonly { readonly cells: readonly { readonly header: boolean; readonly html: string; readonly colspan?: number | undefined; readonly rowspan?: number | undefined }[] }[] }
  | { readonly kind: 'code'; readonly html: string; readonly code: string; readonly language?: string | undefined }
  | { readonly kind: 'callout'; readonly html: string; readonly tone: string; readonly inner: string }
  | { readonly kind: 'details'; readonly html: string; readonly summary: string; readonly inner: string }
  | { readonly kind: 'embed'; readonly html: string; readonly provider: EmbedProvider; readonly id: string; readonly title: string; readonly src: string }
  | { readonly kind: 'button'; readonly html: string; readonly label: string; readonly href?: string | undefined; readonly style?: string | undefined };

/** Formatted text as the site receives it. */
export interface PublicRichText {
  /** Ready to show: every word and address in it is escaped. */
  readonly html: string;
  /** The words alone, one entry per paragraph, heading, list item or cell. */
  readonly paragraphs: readonly string[];
  /** Every heading, in order, with the id it has in `html`. */
  readonly headings: readonly RichTextHeadingLink[];
  /** The text a piece at a time, for a template that draws some kinds itself. */
  readonly parts: readonly RichTextPart[];
  /** The origins its videos, maps and players are shown from, for the page's `frame-src`. */
  readonly frames: readonly string[];
  /** The text as it is kept, for a template that walks it itself. */
  readonly doc: RichText;
}

/** The id a heading's words are given, made unique among those `seen` already. */
export function headingId(words: string, seen: Map<string, number>): string {
  const base =
    words
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
      .replace(/ /g, '-') || 'section';
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

const TAGS = { bold: 'strong', italic: 'em', underline: 'u', strike: 's', superscript: 'sup', subscript: 'sub', code: 'code' } as const;
const outside = (href: string) => /^https?:/i.test(href);

/** Where a link leads today, or nothing: an entry that is not published, or an address no longer allowed. */
function hrefOf(attrs: Pick<RichTextLinkAttrs, 'href' | 'entryType' | 'entry'>, resolvers: RichTextResolvers): string | undefined {
  // Checked again here: what is stored may be older than the rule.
  if (attrs.href !== undefined) return isSafeLink(attrs.href) ? attrs.href : undefined;
  if (attrs.entryType === undefined || attrs.entry === undefined) return undefined;
  const href = resolvers.entryHref?.(attrs.entryType, attrs.entry);
  return href !== undefined && isSafeLink(href) ? href : undefined;
}

function relOf(href: string, attrs: RichTextLinkAttrs): string {
  const rel = [...(outside(href) || attrs.target === '_blank' ? ['noopener', 'noreferrer'] : []), ...(attrs.rel ? [attrs.rel] : [])];
  return rel.length > 0 ? ` rel="${rel.join(' ')}"` : '';
}

class Drawing {
  readonly seen = new Map<string, number>();
  readonly headings: RichTextHeadingLink[] = [];
  readonly frames = new Set<string>();

  constructor(readonly resolvers: RichTextResolvers) {}

  inline(nodes: readonly RichTextInline[] | undefined): string {
    return (nodes ?? [])
      .map((node) => {
        if (node.type === 'hardBreak') return '<br>';
        return (node.marks ?? []).reduce((html, applied: RichTextMark) => {
          if (applied.type === 'link') {
            const href = hrefOf(applied.attrs, this.resolvers);
            if (href === undefined) return html;
            const target = applied.attrs.target === '_blank' ? ' target="_blank"' : '';
            return `<a href="${escapeHtml(href)}"${target}${relOf(href, applied.attrs)}>${html}</a>`;
          }
          if (applied.type === 'colour') return `<span class="cms-colour-${cls(applied.attrs.name)}">${html}</span>`;
          if (applied.type === 'highlight') return `<mark class="cms-highlight-${cls(applied.attrs.name)}">${html}</mark>`;
          return `<${TAGS[applied.type]}>${html}</${TAGS[applied.type]}>`;
        }, escapeHtml(node.text));
      })
      .join('');
  }

  paragraph(node: RichTextParagraph): string {
    return `<p${node.attrs?.align ? ` class="cms-align-${cls(node.attrs.align)}"` : ''}>${this.inline(node.content)}</p>`;
  }

  /** What a cell or a callout holds: one paragraph is its words alone, more are paragraphs. */
  cell(content: readonly RichTextParagraph[]): string {
    const [only] = content;
    if (content.length === 1 && only && !only.attrs?.align) return this.inline(only.content);
    return content.map((paragraph) => this.paragraph(paragraph)).join('');
  }

  table(node: RichTextTable): { html: string; rows: Extract<RichTextPart, { kind: 'table' }>['rows'] } {
    const rows = node.content.map((row) => ({
      cells: row.content.map((one) => ({
        header: one.type === 'tableHeader',
        html: this.cell(one.content),
        ...(one.attrs?.colspan !== undefined && { colspan: one.attrs.colspan }),
        ...(one.attrs?.rowspan !== undefined && { rowspan: one.attrs.rowspan }),
      })),
    }));
    const [first, ...rest] = rows;
    const headed = first !== undefined && first.cells.every((one) => one.header);
    const spans = (one: (typeof rows)[number]['cells'][number]) => `${one.colspan ? ` colspan="${one.colspan}"` : ''}${one.rowspan ? ` rowspan="${one.rowspan}"` : ''}`;
    const row = (cells: (typeof rows)[number]['cells'], inHead: boolean) =>
      `<tr>${cells.map((one) => (one.header ? `<th scope="${inHead ? 'col' : 'row'}"${spans(one)}>${one.html}</th>` : `<td${spans(one)}>${one.html}</td>`)).join('')}</tr>`;
    const body = (headed ? rest : rows).map((one) => row(one.cells, false)).join('');
    const style = node.attrs?.style ? ` cms-table-${cls(node.attrs.style)}` : '';
    const html = `<div class="cms-table${style}" tabindex="0"><table>${headed && first ? `<thead>${row(first.cells, true)}</thead>` : ''}<tbody>${body}</tbody></table></div>`;
    return { html, rows };
  }

  /** One block as HTML, and as a piece when it is a kind a template may draw itself. */
  block(node: RichTextBlock | RichTextListItem): { html: string; part?: RichTextPart } {
    const inside = (content: readonly (RichTextBlock | RichTextListItem)[]) => content.map((one) => this.block(one).html).join('');
    switch (node.type) {
      case 'paragraph':
        return { html: this.paragraph(node) };
      case 'heading': {
        const words = (node.content ?? []).map((part) => (part.type === 'text' ? part.text : ' ')).join('');
        const id = headingId(words, this.seen);
        this.headings.push({ level: node.attrs.level, text: words.trim(), id });
        const align = node.attrs.align ? ` class="cms-align-${cls(node.attrs.align)}"` : '';
        return { html: `<h${node.attrs.level} id="${escapeHtml(id)}"${align}>${this.inline(node.content)}</h${node.attrs.level}>` };
      }
      case 'blockquote':
        return { html: `<blockquote>${inside(node.content)}</blockquote>` };
      case 'bulletList':
        return { html: `<ul>${inside(node.content)}</ul>` };
      case 'orderedList':
        return { html: `<ol${node.attrs?.start !== undefined ? ` start="${node.attrs.start}"` : ''}>${inside(node.content)}</ol>` };
      case 'listItem':
        return { html: `<li>${inside(node.content)}</li>` };
      case 'horizontalRule':
        return { html: '<hr>' };
      case 'codeBlock': {
        const code = (node.content ?? []).map((part) => part.text).join('');
        const language = node.attrs?.language;
        const html = `<pre class="cms-code"${language ? ` data-language="${escapeHtml(language)}"` : ''}><code${language ? ` class="language-${escapeHtml(language)}"` : ''}>${escapeHtml(code)}</code></pre>`;
        return { html, part: { kind: 'code', html, code, ...(language !== undefined && { language }) } };
      }
      case 'image': {
        const { image, alt, caption, href, size } = node.attrs;
        const src = this.resolvers.image?.(image);
        const link = href !== undefined && isSafeLink(href) ? href : undefined;
        const sizes = size === 'full' ? '100vw' : size === 'wide' ? '(min-width: 72rem) 72rem, 100vw' : '(min-width: 48rem) 48rem, 100vw';
        const picture =
          src === undefined
            ? ''
            : `<img src="${escapeHtml(src.src)}" alt="${escapeHtml(alt)}"${src.width ? ` width="${src.width}"` : ''}${src.height ? ` height="${src.height}"` : ''}${src.srcset ? ` srcset="${escapeHtml(src.srcset)}" sizes="${sizes}"` : ''} loading="lazy" decoding="async">`;
        const shown = link && picture ? `<a href="${escapeHtml(link)}"${relOf(link, {})}>${picture}</a>` : picture;
        const html = picture === '' ? '' : `<figure class="cms-image${size ? ` cms-image-${cls(size)}` : ''}">${shown}${caption?.trim() ? `<figcaption>${escapeHtml(caption.trim())}</figcaption>` : ''}</figure>`;
        return {
          html,
          part: { kind: 'image', html, image, alt, size: size ?? 'text', ...(caption?.trim() && { caption: caption.trim() }), ...(link !== undefined && { href: link }), ...(src !== undefined && { src }) },
        };
      }
      case 'table': {
        const { html, rows } = this.table(node);
        return { html, part: { kind: 'table', html, rows, ...(node.attrs?.style !== undefined && { style: node.attrs.style }) } };
      }
      case 'callout': {
        const inner = inside(node.content);
        const html = `<div class="cms-callout cms-callout-${cls(node.attrs.tone)}" role="note">${inner}</div>`;
        return { html, part: { kind: 'callout', html, tone: node.attrs.tone, inner } };
      }
      case 'details': {
        const [summary, content] = node.content;
        const words = this.inline(summary.content);
        const inner = inside(content.content);
        const html = `<details class="cms-details"><summary>${words}</summary><div class="cms-details-content">${inner}</div></details>`;
        return { html, part: { kind: 'details', html, summary: words, inner } };
      }
      case 'embed': {
        const src = embedSource(node.attrs);
        this.frames.add(new URL(src).origin);
        const allow = node.attrs.provider === 'maps' ? '' : ' allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowfullscreen';
        const html = `<figure class="cms-embed cms-embed-${cls(node.attrs.provider)}"><iframe src="${escapeHtml(src)}" title="${escapeHtml(node.attrs.title)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"${allow}></iframe></figure>`;
        return { html, part: { kind: 'embed', html, ...node.attrs, src } };
      }
      case 'button': {
        const href = hrefOf(node.attrs, this.resolvers);
        const style = node.attrs.style ? ` cms-button-${cls(node.attrs.style)}` : '';
        const html = href === undefined ? '' : `<p class="cms-button-row"><a class="cms-button${style}" href="${escapeHtml(href)}"${relOf(href, {})}>${escapeHtml(node.attrs.label)}</a></p>`;
        return { html, part: { kind: 'button', html, label: node.attrs.label, ...(href !== undefined && { href }), ...(node.attrs.style !== undefined && { style: node.attrs.style }) } };
      }
    }
  }
}

/**
 * The text as the site receives it: HTML a page can show as it is (every word and address in it
 * escaped, a link to an entry and a picture only where `resolvers` find them), its words, its
 * headings and the same text a piece at a time.
 */
export function publicRichText(text: RichText, resolvers: RichTextResolvers = {}): PublicRichText {
  const drawing = new Drawing(resolvers);
  const parts: RichTextPart[] = [];
  let prose = '';
  for (const node of text.content) {
    const { html, part } = drawing.block(node);
    if (part === undefined) {
      prose += html;
      continue;
    }
    if (prose !== '') parts.push({ kind: 'prose', html: prose });
    prose = '';
    parts.push(part);
  }
  if (prose !== '') parts.push({ kind: 'prose', html: prose });
  return { html: parts.map((part) => part.html).join(''), paragraphs: richTextParagraphs(text), headings: drawing.headings, parts, frames: [...drawing.frames], doc: text };
}

/** The text as HTML a page can show as it is. Every word and address in it is escaped. */
export function richTextHtml(text: RichText, resolvers: RichTextResolvers = {}): string {
  return publicRichText(text, resolvers).html;
}
