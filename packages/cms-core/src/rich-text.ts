import { z } from 'zod';

/**
 * Formatted text as it is stored: a small tree, not HTML. Nothing in it can be markup, so a
 * page that shows it never has to clean it. The shape is the one ProseMirror-based editors
 * read and write, so the editor needs little translation.
 *
 * A look (a colour, a highlight, a callout's tone, a table's or a button's style) is held as a
 * name the template gave it, never as a colour or a class: the template decides what the name
 * looks like, so a new theme changes every page at once.
 */
export interface RichText {
  readonly type: 'doc';
  readonly content: readonly RichTextBlock[];
}

/** Where a paragraph or a heading stands, when not at the start of the line. */
export type RichTextAlign = 'center' | 'right';

/**
 * Where a link leads: an address typed by hand (`href`), or an entry of the site (`entryType`, the
 * key of its content type, and `entry`, its translation group), which the site turns into the
 * entry's address when it draws the page, as a `link` field's value.
 */
export interface RichTextLinkAttrs {
  readonly href?: string | undefined;
  readonly entryType?: string | undefined;
  readonly entry?: string | undefined;
  /** Opens in a new tab. */
  readonly target?: '_blank' | undefined;
  /** What search engines are told of a link that is paid for or not vouched for. */
  readonly rel?: 'nofollow' | 'sponsored' | undefined;
}

export type RichTextMark =
  | { readonly type: 'bold' | 'italic' | 'underline' | 'strike' | 'superscript' | 'subscript' | 'code' }
  | { readonly type: 'link'; readonly attrs: RichTextLinkAttrs }
  /** Words in one of the template's text colours, by its name. */
  | { readonly type: 'colour'; readonly attrs: { readonly name: string } }
  /** Words marked with one of the template's highlights, by its name. */
  | { readonly type: 'highlight'; readonly attrs: { readonly name: string } };

export type RichTextInline =
  | { readonly type: 'text'; readonly text: string; readonly marks?: readonly RichTextMark[] | undefined }
  | { readonly type: 'hardBreak' };

export interface RichTextParagraph {
  readonly type: 'paragraph';
  readonly attrs?: { readonly align?: RichTextAlign | undefined } | undefined;
  readonly content?: readonly RichTextInline[] | undefined;
}

export interface RichTextHeading {
  readonly type: 'heading';
  readonly attrs: { readonly level: 2 | 3 | 4; readonly align?: RichTextAlign | undefined };
  readonly content?: readonly RichTextInline[] | undefined;
}

/** How wide a picture is shown: as wide as the text (left out), wider, or the whole window. */
export type RichTextImageSize = 'wide' | 'full';

export interface RichTextImage {
  readonly type: 'image';
  readonly attrs: {
    /** What an image field stores: the name of an upload or of one of the site's own images. */
    readonly image: string;
    /** What the picture shows, for whoever cannot see it. Empty only for a picture that adds nothing. */
    readonly alt: string;
    readonly caption?: string | undefined;
    /** Where the picture leads when pressed: an address a site may link to. */
    readonly href?: string | undefined;
    readonly size?: RichTextImageSize | undefined;
  };
}

export interface RichTextTableCell {
  readonly type: 'tableCell' | 'tableHeader';
  readonly attrs?: { readonly colspan?: number | undefined; readonly rowspan?: number | undefined } | undefined;
  readonly content: readonly RichTextParagraph[];
}

export interface RichTextTableRow {
  readonly type: 'tableRow';
  readonly content: readonly RichTextTableCell[];
}

export interface RichTextTable {
  readonly type: 'table';
  /** One of the template's table styles, by name. */
  readonly attrs?: { readonly style?: string | undefined } | undefined;
  readonly content: readonly RichTextTableRow[];
}

/** Code shown as it is, line by line, in one language (`ts`, `html`, `bash`). */
export interface RichTextCodeBlock {
  readonly type: 'codeBlock';
  readonly attrs?: { readonly language?: string | undefined } | undefined;
  readonly content?: readonly { readonly type: 'text'; readonly text: string }[] | undefined;
}

/** A note set apart from the text around it, in one of the template's tones (note, tip, warning). */
export interface RichTextCallout {
  readonly type: 'callout';
  readonly attrs: { readonly tone: string };
  readonly content: readonly (RichTextParagraph | RichTextList)[];
}

/** A question, or a title, that opens to what it holds. */
export interface RichTextDetails {
  readonly type: 'details';
  readonly content: readonly [RichTextDetailsSummary, RichTextDetailsContent];
}

export interface RichTextDetailsSummary {
  readonly type: 'detailsSummary';
  readonly content?: readonly RichTextInline[] | undefined;
}

export interface RichTextDetailsContent {
  readonly type: 'detailsContent';
  readonly content: readonly (RichTextParagraph | RichTextList)[];
}

/** The services a video, a map or a player is shown from. Anything else is a link. */
export const EMBED_PROVIDERS = ['youtube', 'vimeo', 'loom', 'maps', 'spotify'] as const;
export type EmbedProvider = (typeof EMBED_PROVIDERS)[number];

/** A video, a map or a player from one of `EMBED_PROVIDERS`, held as the service and its own id, never as markup. */
export interface RichTextEmbed {
  readonly type: 'embed';
  readonly attrs: { readonly provider: EmbedProvider; readonly id: string; readonly title: string };
}

/** A link drawn as one of the template's buttons. */
export interface RichTextButton {
  readonly type: 'button';
  readonly attrs: {
    readonly label: string;
    readonly href?: string | undefined;
    readonly entryType?: string | undefined;
    readonly entry?: string | undefined;
    readonly style?: string | undefined;
  };
}

export interface RichTextList {
  readonly type: 'bulletList' | 'orderedList';
  /** Where a numbered list starts counting, when not at 1. */
  readonly attrs?: { readonly start?: number | undefined } | undefined;
  readonly content: readonly RichTextListItem[];
}

export type RichTextBlock =
  | RichTextParagraph
  | RichTextHeading
  | { readonly type: 'blockquote'; readonly content: readonly RichTextBlock[] }
  | RichTextList
  | RichTextCodeBlock
  | { readonly type: 'horizontalRule' }
  | RichTextImage
  | RichTextTable
  | RichTextCallout
  | RichTextDetails
  | RichTextEmbed
  | RichTextButton;

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

/** A name a template gives a look: lower case letters, digits and dashes, starting with a letter. */
const LOOK_NAME = /^[a-z][a-z0-9-]{0,39}$/;
export const isLookName = (value: unknown): value is string => typeof value === 'string' && LOOK_NAME.test(value);
const lookName = z.string().regex(LOOK_NAME, 'A look is named by the template: lower case letters, digits and dashes, such as "brand".');

const EMBED_ID: Record<EmbedProvider, RegExp> = {
  youtube: /^[A-Za-z0-9_-]{11}$/,
  vimeo: /^\d{5,12}$/,
  loom: /^[0-9a-f]{32}$/,
  // A place's name or address, as Google Maps searches it.
  maps: /^\P{Cc}{1,200}$/u,
  spotify: /^(?:track|album|playlist|episode|show|artist)\/[A-Za-z0-9]{22}$/,
};

/** Whether an id is one the service could have given. */
export const isEmbedId = (provider: EmbedProvider, id: string): boolean => EMBED_ID[provider].test(id);

/** What a video, map or player is called when nobody named it: the service, as it calls itself. */
export const EMBED_NAMES: Readonly<Record<EmbedProvider, string>> = { youtube: 'YouTube', vimeo: 'Vimeo', loom: 'Loom', maps: 'Google Maps', spotify: 'Spotify' };

/**
 * A video, a map or a player, from the address it is shared at: a YouTube, Vimeo, Loom or
 * Spotify link, or a Google Maps link to a place. Any other address is not one.
 */
export function embedFromUrl(address: string): RichTextEmbed['attrs'] | undefined {
  let url: URL;
  try {
    url = new URL(address.trim());
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
  const host = url.hostname.replace(/^(?:www\.|m\.)/, '');
  const parts = url.pathname.split('/').filter(Boolean);
  const made = (provider: EmbedProvider, id: string | undefined) => (id !== undefined && isEmbedId(provider, id) ? { provider, id, title: EMBED_NAMES[provider] } : undefined);
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (parts[0] === 'watch') return made('youtube', url.searchParams.get('v') ?? undefined);
    if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') return made('youtube', parts[1]);
    return undefined;
  }
  if (host === 'youtu.be') return made('youtube', parts[0]);
  if (host === 'vimeo.com') return made('vimeo', parts.find((part) => /^\d+$/.test(part)));
  if (host === 'player.vimeo.com' && parts[0] === 'video') return made('vimeo', parts[1]);
  if (host === 'loom.com' && (parts[0] === 'share' || parts[0] === 'embed')) return made('loom', parts[1]);
  if (host === 'open.spotify.com') {
    const kind = parts.findIndex((part) => /^(?:track|album|playlist|episode|show|artist)$/.test(part));
    return kind >= 0 ? made('spotify', `${parts[kind]}/${parts[kind + 1] ?? ''}`) : undefined;
  }
  if ((host === 'google.com' || /^maps\.google\.[a-z.]+$/.test(host) || /^google\.[a-z.]+$/.test(host)) && (parts[0] === 'maps' || host.startsWith('maps.'))) {
    const asked = url.searchParams.get('q') ?? url.searchParams.get('query');
    if (asked) return made('maps', asked.trim());
    const place = parts[0] === 'maps' && parts[1] === 'place' ? parts[2] : undefined;
    return place ? made('maps', decodeURIComponent(place).replace(/\+/g, ' ').trim()) : undefined;
  }
  return undefined;
}

/** The address a video, map or player is shown from inside a page. */
export function embedSource({ provider, id }: Pick<RichTextEmbed['attrs'], 'provider' | 'id'>): string {
  if (provider === 'youtube') return `https://www.youtube-nocookie.com/embed/${id}`;
  if (provider === 'vimeo') return `https://player.vimeo.com/video/${id}?dnt=1`;
  if (provider === 'loom') return `https://www.loom.com/embed/${id}`;
  if (provider === 'spotify') return `https://open.spotify.com/embed/${id}`;
  return `https://www.google.com/maps?q=${encodeURIComponent(id)}&output=embed`;
}

/** The address a video, map or player is shared at, for a link to it. */
export function embedAddress({ provider, id }: Pick<RichTextEmbed['attrs'], 'provider' | 'id'>): string {
  if (provider === 'youtube') return `https://www.youtube.com/watch?v=${id}`;
  if (provider === 'vimeo') return `https://vimeo.com/${id}`;
  if (provider === 'loom') return `https://www.loom.com/share/${id}`;
  if (provider === 'spotify') return `https://open.spotify.com/${id}`;
  return `https://www.google.com/maps?q=${encodeURIComponent(id)}`;
}

const LINK_HELP = 'A link must be a web address, an email address, a phone number or a page of this site.';
const safeHref = z.string().max(2000).refine(isSafeLink, LINK_HELP);
const entryKey = z.string().min(1).max(200);

/** An address, or an entry, but never both and never neither. */
const leadsSomewhere = (attrs: { href?: string | undefined; entryType?: string | undefined; entry?: string | undefined }) =>
  attrs.href !== undefined ? attrs.entryType === undefined && attrs.entry === undefined : attrs.entryType !== undefined && attrs.entry !== undefined;
const LEADS_HELP = 'A link leads to an address or to an entry of the site: give `href`, or `entryType` and `entry`.';

/** What an editor sends as "nothing", which the stored text leaves out. */
const unset = <T extends z.ZodType>(schema: T) => z.preprocess((value) => (value === null ? undefined : value), schema.optional());

const linkAttrs = z
  .object({
    href: unset(safeHref),
    entryType: unset(entryKey),
    entry: unset(entryKey),
    target: z.preprocess((value) => (value === '_blank' ? value : undefined), z.literal('_blank').optional()),
    rel: z.preprocess((value) => (value === 'nofollow' || value === 'sponsored' ? value : undefined), z.enum(['nofollow', 'sponsored']).optional()),
  })
  .refine(leadsSomewhere, LEADS_HELP);

const simpleMark = z.object({ type: z.enum(['bold', 'italic', 'underline', 'strike', 'superscript', 'subscript', 'code']) });
const mark = z.union([
  simpleMark,
  z.object({ type: z.literal('link'), attrs: linkAttrs }),
  z.object({ type: z.literal('colour'), attrs: z.object({ name: lookName }) }),
  z.object({ type: z.literal('highlight'), attrs: z.object({ name: lookName }) }),
]);

const inline = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().min(1), marks: z.array(mark).optional() }),
  z.object({ type: z.literal('hardBreak') }),
]);

const align = z.preprocess((value) => (value === 'center' || value === 'right' ? value : undefined), z.enum(['center', 'right']).optional());
/** The attributes an editor sends, with what means nothing (left aligned, the first count) left out. */
const attrsOf = <T extends z.ZodRawShape>(shape: T) =>
  z.preprocess((value) => {
    if (typeof value !== 'object' || value === null) return undefined;
    const kept = Object.fromEntries(Object.entries(value).filter(([key, held]) => key in shape && held !== null && held !== undefined));
    return Object.keys(kept).length > 0 ? kept : undefined;
  }, z.object(shape).optional());

const paragraph = z.object({ type: z.literal('paragraph'), attrs: attrsOf({ align }), content: z.array(inline).optional() });
const list = (item: z.ZodType<RichTextListItem>) =>
  z.object({
    type: z.enum(['bulletList', 'orderedList']),
    attrs: attrsOf({ start: z.preprocess((value) => (value === 1 ? undefined : value), z.number().int().min(0).max(100000).optional()) }),
    content: z.array(item),
  });

const cell = z.object({
  type: z.enum(['tableCell', 'tableHeader']),
  attrs: attrsOf({
    colspan: z.preprocess((value) => (value === 1 ? undefined : value), z.number().int().min(2).max(50).optional()),
    rowspan: z.preprocess((value) => (value === 1 ? undefined : value), z.number().int().min(2).max(500).optional()),
  }),
  content: z.array(paragraph).min(1),
});

const words = (max: number) => z.string().max(max);

const block: z.ZodType<RichTextBlock> = z.lazy(() =>
  z.discriminatedUnion('type', [
    paragraph,
    z.object({
      type: z.literal('heading'),
      attrs: z.object({ level: z.union([z.literal(2), z.literal(3), z.literal(4)]), align }),
      content: z.array(inline).optional(),
    }),
    z.object({ type: z.literal('blockquote'), content: z.array(block) }),
    list(listItem),
    z.object({
      type: z.literal('codeBlock'),
      attrs: attrsOf({ language: z.string().regex(/^[a-z0-9][a-z0-9+#.-]{0,29}$/i, 'A code language is a short name, such as ts, html or bash.').optional() }),
      content: z.array(z.object({ type: z.literal('text'), text: z.string().min(1).max(100000) })).optional(),
    }),
    z.object({ type: z.literal('horizontalRule') }),
    z.object({
      type: z.literal('image'),
      attrs: z.object({
        image: z.string().min(1).max(500),
        alt: z.preprocess((value) => (value === null || value === undefined ? '' : value), words(500)),
        caption: unset(words(1000)),
        href: unset(safeHref),
        size: z.preprocess((value) => (value === 'wide' || value === 'full' ? value : undefined), z.enum(['wide', 'full']).optional()),
      }),
    }),
    z.object({ type: z.literal('table'), attrs: attrsOf({ style: lookName.optional() }), content: z.array(z.object({ type: z.literal('tableRow'), content: z.array(cell).min(1).max(50) })).min(1).max(500) }),
    z.object({ type: z.literal('callout'), attrs: z.object({ tone: lookName }), content: z.array(z.union([paragraph, list(listItem)])).min(1) }),
    z.object({
      type: z.literal('details'),
      content: z.tuple([
        z.object({ type: z.literal('detailsSummary'), content: z.array(inline).optional() }),
        z.object({ type: z.literal('detailsContent'), content: z.array(z.union([paragraph, list(listItem)])).min(1) }),
      ]),
    }),
    z.object({
      type: z.literal('embed'),
      attrs: z
        .object({ provider: z.enum(EMBED_PROVIDERS), id: z.string().min(1).max(200), title: z.string().trim().min(1).max(200) })
        .refine((attrs) => isEmbedId(attrs.provider, attrs.id), 'That is not a video, map or player the service could have given. Paste its address again.'),
    }),
    z.object({
      type: z.literal('button'),
      attrs: z
        .object({ label: z.string().trim().min(1).max(100), href: unset(safeHref), entryType: unset(entryKey), entry: unset(entryKey), style: unset(lookName) })
        .refine(leadsSomewhere, LEADS_HELP),
    }),
  ]),
) as z.ZodType<RichTextBlock>;

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
    .refine((doc) => depthOf(doc) <= MAX_DEPTH, 'Lists and quotes are nested too deeply.')
    .transform((doc) => tidy(doc as RichText)),
) as z.ZodType<RichText>;

/**
 * The text with its keys in one order and nothing empty in it: what the editor sends and what
 * the server keeps are then the same text, written the same way.
 */
function tidy(text: RichText): RichText {
  const strip = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(strip);
    if (typeof value !== 'object' || value === null) return value;
    const entries = Object.entries(value)
      .filter(([, held]) => held !== undefined)
      .map(([key, held]) => [key, strip(held)] as const)
      .filter(([key, held]) => !(key === 'attrs' && typeof held === 'object' && held !== null && Object.keys(held).length === 0));
    const order = ['type', 'attrs', 'text', 'marks', 'content'];
    entries.sort(([a], [b]) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
    return Object.fromEntries(entries);
  };
  return strip(text) as RichText;
}

/**
 * What a rich text field may hold beyond paragraphs. A field names the ones the place it is shown
 * was drawn for (`formats`); one that names none takes them all. `colour` and `highlight` also
 * need the template's palette (`colours`, `highlights`), and are offered only where there is one.
 */
export const RICH_TEXT_FORMATS = [
  'bold',
  'italic',
  'underline',
  'strike',
  'script',
  'code',
  'link',
  'colour',
  'highlight',
  'headings',
  'lists',
  'quotes',
  'align',
  'images',
  'tables',
  'codeBlocks',
  'callouts',
  'details',
  'embeds',
  'buttons',
  'divider',
] as const;
export type RichTextFormat = (typeof RICH_TEXT_FORMATS)[number];

/** The formats a field with none named had before the long-form ones came. */
export const SHORT_RICH_TEXT_FORMATS: readonly RichTextFormat[] = ['bold', 'italic', 'code', 'link', 'headings', 'lists', 'quotes'];

/** One kind of look a template offers: the names stored, what the editor calls each, a sample colour of each. */
export interface RichTextLookChoices {
  readonly choices: readonly string[];
  readonly labels?: Readonly<Record<string, Readonly<Record<string, string>>>> | undefined;
  readonly swatches?: Readonly<Record<string, string>> | undefined;
}

/** The looks a field's text may take, each a named choice of the template's. */
export interface RichTextLooks {
  readonly colours?: RichTextLookChoices | undefined;
  readonly highlights?: RichTextLookChoices | undefined;
  /** The tones of a callout. Left out, `DEFAULT_CALLOUT_TONES`. */
  readonly callouts?: RichTextLookChoices | undefined;
  readonly tables?: RichTextLookChoices | undefined;
  readonly buttons?: RichTextLookChoices | undefined;
}

/** The tones a callout takes when the template names none. The editor has words for each. */
export const DEFAULT_CALLOUT_TONES: readonly string[] = ['note', 'tip', 'warning', 'success'];

const MARK_FORMAT = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strike: 'strike',
  superscript: 'script',
  subscript: 'script',
  code: 'code',
  link: 'link',
  colour: 'colour',
  highlight: 'highlight',
} as const satisfies Record<RichTextMark['type'], RichTextFormat>;

const textOf = (nodes: readonly RichTextInline[] | undefined) => (nodes ?? []).map((node) => (node.type === 'text' ? node.text : ' ')).join('');

/**
 * The text with only what `formats` and the template's looks allow: a mark it leaves out is taken
 * off its words, a heading becomes a paragraph, a list gives its items' paragraphs, a quote, a
 * callout or a table what they hold, a picture its caption, code its lines and a video or a
 * button a link. No word is lost. A look the template no longer has is left off (a callout takes
 * the first tone). Without `formats` and `looks`, the text is as it was.
 */
export function limitRichText(text: RichText, formats: readonly RichTextFormat[] | undefined, looks?: RichTextLooks): RichText {
  if (formats === undefined && looks === undefined) return text;
  const allowed = new Set<RichTextFormat>(formats ?? RICH_TEXT_FORMATS);
  const has = (kind: 'colours' | 'highlights' | 'tables' | 'buttons', name: string) => looks === undefined || (looks[kind]?.choices.includes(name) ?? false);
  const tones = looks?.callouts?.choices ?? DEFAULT_CALLOUT_TONES;
  const keeps = (applied: RichTextMark): boolean => {
    if (!allowed.has(MARK_FORMAT[applied.type])) return false;
    if (applied.type === 'colour') return has('colours', applied.attrs.name);
    if (applied.type === 'highlight') return has('highlights', applied.attrs.name);
    return true;
  };
  const inline = (nodes: readonly RichTextInline[] | undefined): RichTextInline[] | undefined =>
    nodes?.map((node) => {
      if (node.type !== 'text' || node.marks === undefined) return node;
      const marks = node.marks.filter(keeps);
      return marks.length > 0 ? { ...node, marks } : { type: 'text', text: node.text };
    });
  const aligned = <T extends { attrs?: { align?: RichTextAlign | undefined } | undefined }>(node: T): T => {
    if (allowed.has('align') || node.attrs?.align === undefined) return node;
    const { align: _align, ...rest } = node.attrs;
    return { ...node, attrs: Object.keys(rest).length > 0 ? rest : undefined };
  };
  const para = (content: readonly RichTextInline[] | undefined, attrs?: RichTextParagraph['attrs']): RichTextParagraph =>
    aligned({ type: 'paragraph', ...(attrs && { attrs }), ...(content && content.length > 0 && { content: inline(content) }) });
  const linked = (words: string, attrs: RichTextLinkAttrs): RichTextParagraph =>
    para([{ type: 'text', text: words, ...(allowed.has('link') && { marks: [{ type: 'link', attrs }] }) }]);
  const blocks = (nodes: readonly (RichTextBlock | RichTextListItem)[]): RichTextBlock[] =>
    nodes.flatMap((node): RichTextBlock[] => {
      switch (node.type) {
        case 'paragraph':
          return [aligned({ ...node, ...(node.content && { content: inline(node.content) }) })];
        case 'heading': {
          const content = inline(node.content);
          if (!allowed.has('headings')) return [para(content, node.attrs.align ? { align: node.attrs.align } : undefined)];
          return [aligned({ ...node, ...(content && { content }) })];
        }
        case 'blockquote':
          return allowed.has('quotes') ? [{ type: 'blockquote', content: blocks(node.content) }] : blocks(node.content);
        case 'listItem':
          return blocks(node.content);
        case 'bulletList':
        case 'orderedList':
          if (!allowed.has('lists')) return blocks(node.content);
          return [{ ...node, content: node.content.map((item) => ({ type: 'listItem', content: blocks(item.content) })) }];
        case 'codeBlock': {
          if (allowed.has('codeBlocks')) return [node];
          const lines = (node.content ?? []).map((part) => part.text).join('').split('\n');
          const content = lines.flatMap((line, at): RichTextInline[] => [
            ...(at > 0 ? [{ type: 'hardBreak' } as const] : []),
            ...(line === '' ? [] : [{ type: 'text', text: line, ...(allowed.has('code') && { marks: [{ type: 'code' }] }) } as RichTextInline]),
          ]);
          return [{ type: 'paragraph', ...(content.length > 0 && { content }) }];
        }
        case 'horizontalRule':
          return allowed.has('divider') ? [node] : [];
        case 'image': {
          if (allowed.has('images')) return [node];
          const caption = node.attrs.caption?.trim();
          return caption ? [para([{ type: 'text', text: caption }])] : [];
        }
        case 'table': {
          const rows = node.content.map((row) => ({ ...row, content: row.content.map((one) => ({ ...one, content: one.content.flatMap((inner) => blocks([inner]) as RichTextParagraph[]) })) }));
          if (!allowed.has('tables')) return rows.flatMap((row) => row.content.flatMap((one) => one.content));
          const style = node.attrs?.style;
          return [{ type: 'table', ...(style !== undefined && has('tables', style) && { attrs: { style } }), content: rows }];
        }
        case 'callout': {
          const content = blocks(node.content) as RichTextCallout['content'];
          if (!allowed.has('callouts')) return [...content];
          return [{ type: 'callout', attrs: { tone: tones.includes(node.attrs.tone) ? node.attrs.tone : (tones[0] ?? 'note') }, content: content.length > 0 ? content : [{ type: 'paragraph' }] }];
        }
        case 'details': {
          const [summary, inside] = node.content;
          const content = blocks(inside.content) as RichTextDetailsContent['content'];
          if (!allowed.has('details')) return [...(textOf(summary.content).trim() === '' ? [] : [para(summary.content)]), ...content];
          return [{ type: 'details', content: [{ type: 'detailsSummary', ...(summary.content && { content: inline(summary.content) }) }, { type: 'detailsContent', content: content.length > 0 ? content : [{ type: 'paragraph' }] }] }];
        }
        case 'embed':
          return allowed.has('embeds') ? [node] : [linked(node.attrs.title, { href: embedAddress(node.attrs) })];
        case 'button': {
          const { label, style, ...leads } = node.attrs;
          if (!allowed.has('buttons')) return [linked(label, leads)];
          return [{ type: 'button', attrs: { label, ...leads, ...(style !== undefined && has('buttons', style) && { style }) } }];
        }
      }
    });
  return { type: 'doc', content: blocks(text.content) };
}

function blockLines(node: RichTextBlock | RichTextListItem | RichTextTableRow | RichTextTableCell | RichTextDetailsSummary | RichTextDetailsContent): string[] {
  switch (node.type) {
    case 'paragraph':
    case 'heading':
    case 'detailsSummary': {
      const line = textOf(node.content).trim();
      return line === '' ? [] : [line];
    }
    case 'codeBlock':
      return (node.content ?? [])
        .map((part) => part.text)
        .join('')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '');
    case 'horizontalRule':
    case 'embed':
      return [];
    case 'image':
      return node.attrs.caption?.trim() ? [node.attrs.caption.trim()] : [];
    case 'button':
      return [node.attrs.label];
    default:
      return (node.content as readonly (RichTextBlock | RichTextListItem | RichTextTableRow | RichTextTableCell | RichTextDetailsSummary | RichTextDetailsContent)[]).flatMap(blockLines);
  }
}

/** The words alone, one entry per paragraph, heading, list item, cell or line of code: for descriptions, search and titles. */
export function richTextParagraphs(text: RichText): string[] {
  return text.content.flatMap(blockLines);
}

/** Whether there is anything to read in it. */
/**
 * Whether a text holds only what words typed on a page of the site can give back: paragraphs,
 * headings of two levels, lists, quotes, bold, italics, code, line breaks and plain links. Text
 * with anything more (a table, a picture, a colour, a link to an entry) is changed in the form.
 */
export function isPlainRichText(text: RichText): boolean {
  const marksPlain = (node: RichTextInline): boolean =>
    node.type === 'hardBreak' ||
    (node.marks ?? []).every(
      (applied) => applied.type === 'bold' || applied.type === 'italic' || applied.type === 'code' || (applied.type === 'link' && applied.attrs.href !== undefined && applied.attrs.entryType === undefined && applied.attrs.target === undefined && applied.attrs.rel === undefined),
    );
  const plain = (node: RichTextBlock | RichTextListItem): boolean => {
    switch (node.type) {
      case 'paragraph':
        return node.attrs?.align === undefined && (node.content ?? []).every(marksPlain);
      case 'heading':
        return node.attrs.level !== 4 && node.attrs.align === undefined && (node.content ?? []).every(marksPlain);
      case 'bulletList':
        return node.content.every(plain);
      case 'orderedList':
        return node.attrs?.start === undefined && node.content.every(plain);
      case 'listItem':
      case 'blockquote':
        return node.content.every(plain);
      default:
        return false;
    }
  };
  return text.content.every(plain);
}

export const isEmptyRichText = (text: RichText): boolean => richTextParagraphs(text).length === 0 && !text.content.some((block) => block.type === 'image' || block.type === 'embed');

/** Every entry the text links to, and every picture it shows: what a page must look up before it is drawn. */
export function richTextNeeds(text: RichText): { readonly entries: readonly { readonly type: string; readonly entry: string }[]; readonly images: readonly string[] } {
  const entries = new Map<string, { type: string; entry: string }>();
  const images = new Set<string>();
  const visit = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) return;
    const { type, attrs, marks, content } = node as { type?: unknown; attrs?: Record<string, unknown>; marks?: unknown; content?: unknown };
    const leads = (held: Record<string, unknown> | undefined) => {
      if (typeof held?.['entryType'] === 'string' && typeof held['entry'] === 'string') entries.set(`${held['entryType']}/${held['entry']}`, { type: held['entryType'], entry: held['entry'] });
    };
    if (type === 'image' && typeof attrs?.['image'] === 'string') images.add(attrs['image']);
    if (type === 'button') leads(attrs);
    if (Array.isArray(marks)) for (const applied of marks as { type?: unknown; attrs?: Record<string, unknown> }[]) if (applied.type === 'link') leads(applied.attrs);
    if (Array.isArray(content)) content.forEach(visit);
  };
  text.content.forEach(visit);
  return { entries: [...entries.values()], images: [...images] };
}

export { richTextHtml, publicRichText, headingId, type PublicRichText, type RichTextPart, type RichTextHeadingLink, type RichTextResolvers, type ResolvedImage } from './rich-text-html.js';
export { richTextFromMarkdown, richTextToMarkdown } from './rich-text-markdown.js';
