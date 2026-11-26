import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details';
import { Link } from '@tiptap/extension-link';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import { NodeSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { EditorContent, Extension, Mark, Node as TiptapNode, useEditor, useEditorState, type AnyExtension, type Editor, type JSONContent } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { StarterKit } from '@tiptap/starter-kit';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  ChevronDown,
  ChevronsDownUp,
  Code,
  Highlighter,
  Heading2,
  Heading3,
  Heading4,
  Image,
  Info,
  Italic,
  Keyboard,
  Link2,
  List,
  ListOrdered,
  Minus,
  MousePointerClick,
  Plus,
  Search,
  SlidersHorizontal,
  SquareCode,
  Strikethrough,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Table as TableIcon,
  TextQuote,
  Underline,
  MonitorPlay,
  type LucideIcon,
} from 'lucide-react';
import { Fragment, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  Autocomplete,
  Button as AriaButton,
  Dialog,
  DialogTrigger,
  Group,
  Input,
  Menu as AriaMenu,
  MenuItem,
  MenuTrigger,
  Popover,
  SearchField,
  Separator,
  ToggleButton,
  Toolbar,
  useFilter,
} from 'react-aria-components';
import { Button } from '../Button/index.js';
import { Checkbox } from '../Checkbox/index.js';
import { Segmented } from '../Segmented/index.js';
import { Select } from '../Select/index.js';
import { TextField } from '../TextField/index.js';
import { Tooltip } from '../Tooltip/index.js';
import {
  richTextEditorAnchorClass,
  richTextEditorBoxVariants,
  richTextEditorBubbleClass,
  richTextEditorBubbleLayerClass,
  richTextEditorClass,
  richTextEditorContentClass,
  richTextEditorCountClass,
  richTextEditorDescriptionClass,
  richTextEditorErrorClass,
  richTextEditorLabelVariants,
  richTextEditorLinkActionsClass,
  richTextEditorLinkDialogClass,
  richTextEditorLinkOuterClass,
  richTextEditorLinkPanelClass,
  richTextEditorMenuClass,
  richTextEditorMenuIconSize,
  richTextEditorMenuItemClass,
  richTextEditorMenuPanelClass,
  richTextEditorPicturePreviewClass,
  richTextEditorRequiredMarkClass,
  richTextEditorSeparatorClass,
  richTextEditorShortcutKeysClass,
  richTextEditorShortcutListClass,
  richTextEditorShortcutRowClass,
  richTextEditorSlashEmptyClass,
  richTextEditorSlashInputClass,
  richTextEditorSlashSearchClass,
  richTextEditorSwatchClass,
  richTextEditorToolClass,
  richTextEditorToolIconSize,
  richTextEditorToolMenuClass,
  richTextEditorToolbarClass,
} from './RichTextEditor.variants.js';

/** Formatted text as a tree: `{ type: 'doc', content: [...] }`. The editor reads and writes it as it is. */
export interface RichTextDocument {
  readonly type: 'doc';
  readonly content?: readonly unknown[];
}

/** Every word the editor shows or reads out. */
export interface RichTextEditorWords {
  /** The toolbar's name, such as "Formatting". */
  readonly toolbar: string;
  readonly bold: string;
  readonly italic: string;
  readonly underline: string;
  readonly strike: string;
  readonly superscript: string;
  readonly subscript: string;
  /** Words set as code, such as `npm install`. */
  readonly code: string;
  readonly heading: string;
  readonly subheading: string;
  readonly smallHeading: string;
  readonly bulletList: string;
  readonly numberedList: string;
  readonly quote: string;
  readonly link: string;
  /** The label of the box a link's address is typed in, such as "Link address". */
  readonly linkAddress: string;
  /** Under that box, such as "A web address, or a page of this site like /contact/". */
  readonly linkHelp: string;
  readonly linkApply: string;
  readonly linkRemove: string;
  readonly linkNewTab: string;
  /** What search engines are told of the link, such as "Tell search engines". */
  readonly linkRel: string;
  readonly linkRelNone: string;
  readonly linkRelNofollow: string;
  readonly linkRelSponsored: string;
  readonly colour: string;
  readonly colourNone: string;
  readonly highlight: string;
  readonly highlightNone: string;
  readonly align: string;
  readonly alignLeft: string;
  readonly alignCenter: string;
  readonly alignRight: string;
  /** The menu of things to add, such as "Add". */
  readonly insert: string;
  readonly picture: string;
  readonly table: string;
  readonly codeBlock: string;
  readonly callout: string;
  readonly details: string;
  readonly embed: string;
  readonly button: string;
  readonly divider: string;
  /** The small bar over chosen words, such as "Chosen words". */
  readonly selection: string;
  /** The menu typing / opens, such as "Add a block". */
  readonly slash: string;
  readonly slashSearch: string;
  readonly slashEmpty: string;
  /** The button that opens what can be set on the picture, table or block the cursor is in. */
  readonly settings: string;
  readonly remove: string;
  readonly pictureAlt: string;
  readonly pictureAltHelp: string;
  readonly pictureCaption: string;
  readonly pictureSize: string;
  readonly pictureSizeText: string;
  readonly pictureSizeWide: string;
  readonly pictureSizeFull: string;
  readonly pictureLink: string;
  readonly pictureChange: string;
  /** Shown in place of a picture the site no longer has. */
  readonly pictureMissing: string;
  readonly tableActions: string;
  readonly rowAbove: string;
  readonly rowBelow: string;
  readonly columnBefore: string;
  readonly columnAfter: string;
  readonly deleteRow: string;
  readonly deleteColumn: string;
  readonly headerRow: string;
  readonly mergeCells: string;
  readonly splitCell: string;
  readonly deleteTable: string;
  readonly tableStyle: string;
  readonly buttonStyle: string;
  /** The look a table or a button has when none is chosen, such as "Standard". */
  readonly lookDefault: string;
  readonly codeLanguage: string;
  readonly codeLanguageHelp: string;
  readonly calloutTone: string;
  /** What the editor calls the tones of a callout the template does not name, by tone. */
  readonly tones: Readonly<Record<string, string>>;
  readonly detailsShow: string;
  readonly detailsHide: string;
  readonly embedAddress: string;
  readonly embedHelp: string;
  readonly embedNotKnown: string;
  readonly embedTitle: string;
  readonly buttonLabel: string;
  readonly shortcuts: string;
  /** Each shortcut, as keys and what they do. */
  readonly shortcutList: readonly {
    readonly keys: string;
    readonly does: string;
  }[];
  /** How long the text is, such as "312 words, about 2 minutes to read". */
  readonly count: (words: number, minutes: number) => string;
}

/** What the text may hold beyond paragraphs: each is a tool, and what typing or pasting can make. */
export type RichTextFormat =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'script'
  | 'code'
  | 'link'
  | 'colour'
  | 'highlight'
  | 'headings'
  | 'lists'
  | 'quotes'
  | 'align'
  | 'images'
  | 'tables'
  | 'codeBlocks'
  | 'callouts'
  | 'details'
  | 'embeds'
  | 'buttons'
  | 'divider';

/** One look of the site's: the name kept in the text, what it is called, and a sample of it. */
export interface RichTextLook {
  readonly name: string;
  readonly label: string;
  /** A sample colour, as CSS writes one. */
  readonly swatch?: string;
}

/** The looks the site offers for this text. A kind with none is not offered (callouts take `tones` from the words). */
export interface RichTextEditorLooks {
  readonly colours?: readonly RichTextLook[];
  readonly highlights?: readonly RichTextLook[];
  readonly callouts?: readonly RichTextLook[];
  readonly tables?: readonly RichTextLook[];
  readonly buttons?: readonly RichTextLook[];
}

/** Where a link or a button leads: an address, or an entry of the site. */
export type RichTextLinkValue = { readonly kind: 'address'; readonly href: string } | { readonly kind: 'entry'; readonly type: string; readonly entry: string };

/** A picture of the site, by the name the text keeps and where the editor can show it from. */
export interface RichTextPicture {
  readonly image: string;
  readonly src?: string | undefined;
}

/** A video, a map or a player, as the service and its id. */
export interface RichTextEmbedValue {
  readonly provider: string;
  readonly id: string;
  readonly title: string;
}

export interface RichTextEditorProps {
  /** Always given. It is read out even when it is not shown. */
  readonly label: string;
  /** Keeps the label for screen readers only, for a row of a list whose own label is in view. */
  readonly isLabelHidden?: boolean;
  readonly description?: string;
  /** What is wrong and how to fix it. Setting it marks the field invalid. */
  readonly errorMessage?: string;
  readonly isRequired?: boolean;
  /** The text, or `null` when there is none. */
  readonly value: RichTextDocument | null;
  /** Called with the text as it changes, and with `null` once nothing is left to read. */
  readonly onChange: (value: RichTextDocument | null) => void;
  readonly words: RichTextEditorWords;
  /**
   * Only these formats, for text shown in a tight spot of a design: the toolbar offers no
   * others, and typing or pasting cannot make them. Left out, every format.
   */
  readonly formats?: readonly RichTextFormat[];
  /** The site's colours, highlights and styles. Colours and highlights are offered only where the site has some. */
  readonly looks?: RichTextEditorLooks;
  /** Opens the site's pictures to choose one. Without it, pictures cannot be added. */
  readonly onPickImage?: (current?: string) => Promise<RichTextPicture | undefined>;
  /** Keeps a picture that was pasted or dropped, and answers with its name. */
  readonly onUploadImage?: (file: File) => Promise<RichTextPicture | undefined>;
  /** Where the editor shows a picture of the site from, by its name. */
  readonly imageSrc?: (image: string) => string | undefined;
  /** Draws the control a link's place is chosen in (an address, or an entry of the site). Without it, an address is typed. */
  readonly renderLinkChooser?: (value: RichTextLinkValue | undefined, onChange: (value: RichTextLinkValue | undefined) => void) => ReactNode;
  /** A video, a map or a player from the address it is shared at. Without it, none can be added. */
  readonly embedFrom?: (address: string) => RichTextEmbedValue | undefined;
  /** What a service is called, for a video, map or player shown in the text. */
  readonly embedName?: (provider: string) => string;
  /** Told how many pictures of what was pasted could not be kept, so the person can upload them. */
  readonly onPasteDropped?: (pictures: number) => void;
}

const EVERY_FORMAT: readonly RichTextFormat[] = [
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
];

const EMPTY: RichTextDocument = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Where a link may lead: a web address, an email address, a phone number or a place on this site. */
const isSafeLink = (href: string): boolean => /^(?:https?:\/\/|mailto:|tel:)\S+$/i.test(href) || /^(?:\/(?!\/)|#)\S*$/.test(href);

interface Node {
  readonly type?: string;
  readonly attrs?: Readonly<Record<string, unknown>>;
  readonly content?: readonly Node[];
  readonly marks?: readonly {
    readonly type?: string;
    readonly attrs?: Readonly<Record<string, unknown>>;
  }[];
  readonly text?: string;
}

const NODE_FORMAT: Readonly<Record<string, RichTextFormat | null>> = {
  doc: null,
  paragraph: null,
  text: null,
  hardBreak: null,
  heading: 'headings',
  bulletList: 'lists',
  orderedList: 'lists',
  listItem: 'lists',
  blockquote: 'quotes',
  codeBlock: 'codeBlocks',
  horizontalRule: 'divider',
  image: 'images',
  table: 'tables',
  tableRow: 'tables',
  tableCell: 'tables',
  tableHeader: 'tables',
  callout: 'callouts',
  details: 'details',
  detailsSummary: 'details',
  detailsContent: 'details',
  embed: 'embeds',
  button: 'buttons',
};
const MARK_FORMAT: Readonly<Record<string, RichTextFormat>> = {
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
};

/**
 * The text with only what the editor is built for. The editor drops a whole block it has no part
 * for, words and all, so a heading becomes a paragraph, anything else that holds blocks gives
 * what it holds, a block that holds none (a picture, a video) is left out, and a mark it leaves
 * out comes off its words before the text reaches it.
 */
function fitTo(text: RichTextDocument, allows: (format: RichTextFormat) => boolean): RichTextDocument {
  const fit = (nodes: readonly Node[]): Node[] =>
    nodes.flatMap((node): Node[] => {
      if (node.type === 'text') {
        const marks = node.marks?.filter((applied) => {
          const format = applied.type === undefined ? undefined : MARK_FORMAT[applied.type];
          return format !== undefined && allows(format);
        });
        const { marks: _all, ...words } = node;
        return [marks && marks.length > 0 ? { ...words, marks } : words];
      }
      const format = node.type === undefined ? undefined : NODE_FORMAT[node.type];
      const content = node.content && fit(node.content);
      if (format === null || (format !== undefined && allows(format))) return [{ ...node, ...(content && { content }) }];
      if (node.type === 'heading') return [{ type: 'paragraph', ...(content && { content }) }];
      return content ?? [];
    });
  return { ...text, content: fit((text.content ?? []) as readonly Node[]) };
}

/**
 * What a kind of node keeps of the attributes the editor gives it, in the order the text keeps
 * them: what the editor sends and what the site saves are then the same text, written the same way.
 */
const KEPT_ATTRS: Readonly<Record<string, readonly string[]>> = {
  paragraph: ['align'],
  heading: ['level', 'align'],
  orderedList: ['start'],
  codeBlock: ['language'],
  image: ['image', 'alt', 'caption', 'href', 'size'],
  table: ['style'],
  tableCell: ['colspan', 'rowspan'],
  tableHeader: ['colspan', 'rowspan'],
  callout: ['tone'],
  embed: ['provider', 'id', 'title'],
  button: ['label', 'href', 'entryType', 'entry', 'style'],
  link: ['href', 'entryType', 'entry', 'target', 'rel'],
  colour: ['name'],
  highlight: ['name'],
};
/** Values that mean nothing: the first count of a list, a cell one wide. */
const MEANS_NOTHING: Readonly<Record<string, unknown>> = {
  start: 1,
  colspan: 1,
  rowspan: 1,
};

function keptAttrs(type: string, attrs: Readonly<Record<string, unknown>> | undefined): Record<string, unknown> | undefined {
  const kept: Record<string, unknown> = {};
  for (const key of KEPT_ATTRS[type] ?? []) {
    const value = attrs?.[key];
    if (value === null || value === undefined || value === '' || MEANS_NOTHING[key] === value) continue;
    kept[key] = value;
  }
  // A picture always says what it shows, even when that is nothing.
  if (type === 'image')
    return {
      image: kept['image'] ?? '',
      alt: kept['alt'] ?? '',
      ...Object.fromEntries(Object.entries(kept).filter(([key]) => key !== 'image' && key !== 'alt')),
    };
  return Object.keys(kept).length > 0 ? kept : undefined;
}

/** The text as the editor gives it, written as the site keeps it. */
function fromEditor(json: JSONContent): RichTextDocument {
  const tidy = (node: JSONContent): Node => {
    const type = node.type ?? 'paragraph';
    const attrs = keptAttrs(type, node.attrs);
    const marks = node.marks?.map((applied) => {
      const kept = keptAttrs(applied.type, applied.attrs);
      return { type: applied.type, ...(kept && { attrs: kept }) };
    });
    return {
      type,
      ...(attrs && { attrs }),
      ...(node.text !== undefined && { text: node.text }),
      ...(marks && marks.length > 0 && { marks }),
      ...(node.content && node.content.length > 0 && { content: node.content.map(tidy) }),
    };
  };
  return { type: 'doc', content: (json.content ?? []).map(tidy) };
}

/**
 * The text without the empty lines at its end. The editor keeps one there so the cursor can
 * always get out of a list or a quote; it is not something the person wrote.
 */
function withoutEmptyEnd(text: RichTextDocument): RichTextDocument {
  const content = [...(text.content ?? [])];
  const isEmptyLine = (node: unknown) => same(node, { type: 'paragraph' });
  while (content.length > 1 && isEmptyLine(content.at(-1))) content.pop();
  return { type: 'doc', content };
}

/** Words in one of the site's text colours, kept by its name; the editor shows its sample. */
const Colour = /* @__PURE__ */ Mark.create<{ looks: readonly RichTextLook[] }>({
  name: 'colour',
  addOptions: () => ({ looks: [] }),
  addAttributes: () => ({
    name: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-colour'),
    },
  }),
  parseHTML: () => [{ tag: 'span[data-colour]' }],
  renderHTML({ mark }) {
    const swatch = this.options.looks.find((look) => look.name === mark.attrs['name'])?.swatch;
    return [
      'span',
      {
        'data-colour': mark.attrs['name'],
        ...(swatch && { style: `color: ${swatch}` }),
      },
      0,
    ];
  },
});

/** Words marked with one of the site's highlights, kept by its name. */
const Highlight = /* @__PURE__ */ Mark.create<{ looks: readonly RichTextLook[] }>({
  name: 'highlight',
  addOptions: () => ({ looks: [] }),
  addAttributes: () => ({
    name: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-highlight'),
    },
  }),
  parseHTML: () => [{ tag: 'mark[data-highlight]' }],
  renderHTML({ mark }) {
    const swatch = this.options.looks.find((look) => look.name === mark.attrs['name'])?.swatch;
    return [
      'mark',
      {
        'data-highlight': mark.attrs['name'],
        ...(swatch && { style: `background-color: ${swatch}` }),
      },
      0,
    ];
  },
});

/** Where a paragraph or a heading stands: kept as `align`, and read from what is pasted (`text-align`). */
const Align = /* @__PURE__ */ Extension.create({
  name: 'align',
  addGlobalAttributes: () => [
    {
      types: ['paragraph', 'heading'],
      attributes: {
        align: {
          default: null,
          parseHTML: (element: HTMLElement) => {
            const said = /\bcms-align-(center|right)\b/.exec(element.className)?.[1] ?? element.style.textAlign;
            return said === 'center' || said === 'right' ? said : null;
          },
          renderHTML: (attrs: Record<string, unknown>) =>
            attrs['align']
              ? {
                  'data-align': attrs['align'],
                  style: `text-align: ${String(attrs['align'])}`,
                }
              : {},
        },
      },
    },
  ],
});

/** A link to an address, or to an entry of the site (`entryType`, `entry`), which the site turns into its address. */
const SiteLink = /* @__PURE__ */ Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      entryType: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-entry-type'),
        renderHTML: (attrs: Record<string, unknown>) => (attrs['entryType'] ? { 'data-entry-type': attrs['entryType'] } : {}),
      },
      entry: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-entry'),
        renderHTML: (attrs: Record<string, unknown>) => (attrs['entry'] ? { 'data-entry': attrs['entry'] } : {}),
      },
    };
  },
});

/** A picture of the site's, by its name, as wide as the text, wider, or the whole window. */
const Picture = /* @__PURE__ */ TiptapNode.create<{
  srcOf: (image: string) => string | undefined;
  missing: string;
}>({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addOptions: () => ({ srcOf: () => undefined, missing: '' }),
  addAttributes: () => ({
    image: {
      default: '',
      parseHTML: (element) => element.getAttribute('data-cms-image') ?? '',
    },
    alt: {
      default: '',
      parseHTML: (element) => element.getAttribute('data-alt') ?? '',
    },
    caption: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-caption'),
    },
    href: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-href'),
    },
    size: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-size'),
    },
  }),
  // Only a picture of the editor's own: one pasted from elsewhere is no picture of the site.
  parseHTML: () => [{ tag: 'figure[data-cms-image]' }],
  renderHTML({ node }) {
    const { image, alt, caption, href, size } = node.attrs as Record<string, string | null>;
    const src = image ? this.options.srcOf(image) : undefined;
    return [
      'figure',
      {
        'data-cms-image': image,
        'data-alt': alt,
        'data-size': size ?? 'text',
        ...(caption && { 'data-caption': caption }),
        ...(href && { 'data-href': href }),
      },
      src ? ['img', { src, alt: alt ?? '' }] : ['span', { 'data-missing': '' }, this.options.missing],
      ...(caption ? [['figcaption', {}, caption]] : []),
    ];
  },
});

/** A video, a map or a player, as the service and its id. */
const Embed = /* @__PURE__ */ TiptapNode.create<{ nameOf: (provider: string) => string }>({
  name: 'embed',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addOptions: () => ({ nameOf: (provider: string) => provider }),
  addAttributes: () => ({
    provider: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-cms-embed'),
    },
    id: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-id'),
    },
    title: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-title'),
    },
  }),
  parseHTML: () => [{ tag: 'figure[data-cms-embed]' }],
  renderHTML({ node }) {
    const { provider, id, title } = node.attrs as Record<string, string>;
    return ['figure', { 'data-cms-embed': provider, 'data-id': id, 'data-title': title }, ['span', {}, !title || title === this.options.nameOf(provider ?? '') ? this.options.nameOf(provider ?? '') : `${this.options.nameOf(provider ?? '')} · ${title}`]];
  },
});

/** A link drawn as one of the site's buttons. */
const LinkButton = /* @__PURE__ */ TiptapNode.create({
  name: 'button',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes: () => ({
    label: { default: '', parseHTML: (element) => element.textContent ?? '' },
    href: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-href'),
    },
    entryType: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-entry-type'),
    },
    entry: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-entry'),
    },
    style: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-style'),
    },
  }),
  parseHTML: () => [{ tag: 'p[data-cms-button]' }],
  renderHTML({ node }) {
    const { label, href, entryType, entry, style } = node.attrs as Record<string, string | null>;
    return [
      'p',
      {
        'data-cms-button': '',
        ...(href && { 'data-href': href }),
        ...(entryType && { 'data-entry-type': entryType }),
        ...(entry && { 'data-entry': entry }),
        ...(style && { 'data-style': style }),
      },
      ['span', {}, label ?? ''],
    ];
  },
});

/** A note set apart from the text around it, in one of the site's tones. */
const Callout = /* @__PURE__ */ TiptapNode.create<{ tones: readonly RichTextLook[] }>({
  name: 'callout',
  group: 'block',
  content: '(paragraph|bulletList|orderedList)+',
  defining: true,
  addOptions: () => ({ tones: [] }),
  addAttributes() {
    return {
      tone: {
        default: this.options.tones[0]?.name ?? 'note',
        parseHTML: (element) => element.getAttribute('data-cms-callout'),
      },
    };
  },
  parseHTML: () => [{ tag: 'div[data-cms-callout]' }],
  renderHTML({ node }) {
    const tone = String(node.attrs['tone']);
    return [
      'div',
      {
        'data-cms-callout': tone,
        'data-label': this.options.tones.find((look) => look.name === tone)?.label ?? tone,
      },
      0,
    ];
  },
});

const ListsOnly = '(paragraph|bulletList|orderedList)+';

/** The parts the editor is built from, for the formats and looks it allows. A part left out cannot be typed or pasted. */
function partsFor(
  allows: (format: RichTextFormat) => boolean,
  looks: RichTextEditorLooks,
  tones: readonly RichTextLook[],
  words: RichTextEditorWords,
  srcOf: (image: string) => string | undefined,
  nameOf: (provider: string) => string,
): AnyExtension[] {
  const parts: (AnyExtension | false)[] = [
    StarterKit.configure({
      heading: allows('headings') && { levels: [2, 3, 4] },
      link: false,
      bold: allows('bold') && {},
      italic: allows('italic') && {},
      underline: allows('underline') && {},
      strike: allows('strike') && {},
      bulletList: allows('lists') && {},
      orderedList: allows('lists') && {},
      listItem: allows('lists') && {},
      listKeymap: allows('lists') && {},
      blockquote: allows('quotes') && {},
      code: allows('code') && {},
      codeBlock: allows('codeBlocks') && {
        defaultLanguage: null,
        HTMLAttributes: { spellcheck: 'false' },
      },
      horizontalRule: allows('divider') && {},
    }),
    allows('link') &&
      SiteLink.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        HTMLAttributes: { target: null, rel: null },
        isAllowedUri: (url) => isSafeLink(url),
      }),
    allows('script') && Superscript,
    allows('script') && Subscript,
    allows('colour') && (looks.colours?.length ?? 0) > 0 && Colour.configure({ looks: looks.colours ?? [] }),
    allows('highlight') && (looks.highlights?.length ?? 0) > 0 && Highlight.configure({ looks: looks.highlights ?? [] }),
    allows('align') && Align,
    allows('images') && Picture.configure({ srcOf, missing: words.pictureMissing }),
    allows('tables') &&
      Table.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            style: {
              default: null,
              parseHTML: (element: HTMLElement) => element.getAttribute('data-style'),
              renderHTML: (attrs: Record<string, unknown>) => (attrs['style'] ? { 'data-style': attrs['style'] } : {}),
            },
          };
        },
      }).configure({ resizable: false }),
    allows('tables') && TableRow,
    allows('tables') && TableHeader.extend({ content: 'paragraph+' }),
    allows('tables') && TableCell.extend({ content: 'paragraph+' }),
    allows('callouts') && Callout.configure({ tones }),
    allows('details') &&
      Details.configure({
        renderToggleButton: ({ element, isOpen }: { element: HTMLElement; isOpen: boolean }) => {
          element.setAttribute('aria-label', isOpen ? words.detailsHide : words.detailsShow);
          element.setAttribute('aria-expanded', String(isOpen));
        },
      }),
    allows('details') && DetailsSummary,
    allows('details') && DetailsContent.extend({ content: ListsOnly }),
    allows('embeds') && Embed.configure({ nameOf }),
    allows('buttons') && LinkButton,
  ];
  return parts.filter((part): part is AnyExtension => part !== false);
}

interface Tool {
  readonly name: string;
  readonly format: RichTextFormat;
  readonly icon: LucideIcon;
  readonly isActive: (editor: Editor) => boolean;
  readonly run: (editor: Editor) => void;
}

/** Something that can be added to the text: from the Add menu, and from the menu typing / opens. */
interface Addition {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly isBlockStyle?: boolean;
}

/** The node the cursor is in, or that is chosen, that has settings of its own. */
interface Focused {
  readonly type: 'image' | 'embed' | 'button' | 'codeBlock' | 'callout' | 'table';
  readonly attrs: Readonly<Record<string, unknown>>;
  readonly pos: number;
}

const WITH_SETTINGS = new Set(['image', 'embed', 'button']);
const AROUND_SETTINGS = new Set(['codeBlock', 'callout', 'table']);

function focusedOf(editor: Editor): Focused | undefined {
  const { selection } = editor.state;
  if (selection instanceof NodeSelection && WITH_SETTINGS.has(selection.node.type.name)) {
    return {
      type: selection.node.type.name as Focused['type'],
      attrs: selection.node.attrs,
      pos: selection.from,
    };
  }
  for (let depth = selection.$from.depth; depth > 0; depth--) {
    const node = selection.$from.node(depth);
    if (AROUND_SETTINGS.has(node.type.name))
      return {
        type: node.type.name as Focused['type'],
        attrs: node.attrs,
        pos: selection.$from.before(depth),
      };
  }
  return undefined;
}

/** Changes the attributes of the node at `pos`, keeping the cursor where it is. */
function setAttrs(editor: Editor, pos: number, changes: Readonly<Record<string, unknown>>): void {
  editor
    .chain()
    .command(({ tr }) => {
      const node = tr.doc.nodeAt(pos);
      if (!node) return false;
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...changes });
      const selection = editor.state.selection;
      if (selection instanceof NodeSelection && selection.from === pos) tr.setSelection(NodeSelection.create(tr.doc, pos));
      return true;
    })
    .run();
}

/** The words of the text and how long they take to read, at about 230 words a minute. */
function countOf(editor: Editor): { words: number; minutes: number } {
  const words = editor.state.doc.textBetween(0, editor.state.doc.content.size, ' ', ' ').split(/\s+/).filter(Boolean).length;
  return { words, minutes: Math.max(1, Math.round(words / 230)) };
}

/**
 * Text with headings, lists, quotes, marks, links, pictures, tables, code, callouts, details,
 * videos and buttons, with its label, help and error. What a site does not offer is left out.
 */
export function RichTextEditor({
  label,
  isLabelHidden = false,
  description,
  errorMessage,
  isRequired = false,
  value,
  onChange,
  words,
  formats = EVERY_FORMAT,
  looks = {},
  onPickImage,
  onUploadImage,
  imageSrc,
  renderLinkChooser,
  embedFrom,
  embedName,
  onPasteDropped,
}: RichTextEditorProps) {
  const tones =
    looks.callouts ??
    Object.entries(words.tones).map(([name, toneLabel]) => ({
      name,
      label: toneLabel,
    }));
  const allows = (format: RichTextFormat) => {
    if (!formats.includes(format)) return false;
    if (format === 'colour') return (looks.colours?.length ?? 0) > 0;
    if (format === 'highlight') return (looks.highlights?.length ?? 0) > 0;
    if (format === 'images') return onPickImage !== undefined || onUploadImage !== undefined;
    if (format === 'embeds') return embedFrom !== undefined;
    return true;
  };
  // The formats and looks decide which parts the editor is built from, so another set builds it anew.
  const lookKey = JSON.stringify([looks, tones]);
  const formatsKey = `${EVERY_FORMAT.filter(allows).join(' ')} ${lookKey}`;
  const labelId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const described = [description !== undefined && descriptionId, errorMessage !== undefined && errorId].filter(Boolean).join(' ');
  // What the editor last said, so a value that only echoes it does not move the cursor.
  const said = useRef<RichTextDocument | null>(value);
  const changed = useRef(onChange);
  changed.current = onChange;
  // Pictures chosen or uploaded here, shown before the site's list of them has caught up.
  const known = useRef(new Map<string, string>());
  const srcAt = useRef(imageSrc);
  srcAt.current = imageSrc;
  const srcOf = (image: string) => known.current.get(image) ?? srcAt.current?.(image);
  const uploads = useRef(onUploadImage);
  uploads.current = onUploadImage;
  const dropped = useRef(onPasteDropped);
  dropped.current = onPasteDropped;
  const embeds = useRef(embedFrom);
  embeds.current = embedFrom;
  const [slash, setSlash] = useState<{
    at: number;
    left: number;
    top: number;
  } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [askEmbed, setAskEmbed] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const insertRef = useRef<HTMLButtonElement>(null);

  /** Keeps the pictures of files that were pasted or dropped, and adds them where they landed. */
  const keepFiles = (view: EditorView, files: readonly File[], at?: number) => {
    const upload = uploads.current;
    const pictures = files.filter((file) => file.type.startsWith('image/'));
    if (!upload || pictures.length === 0 || !view.state.schema.nodes['image']) return false;
    void (async () => {
      for (const file of pictures) {
        const kept = await upload(file).catch(() => undefined);
        if (!kept) continue;
        if (kept.src) known.current.set(kept.image, kept.src);
        const node = view.state.schema.nodes['image']?.create({
          image: kept.image,
          alt: '',
        });
        if (!node) continue;
        const tr = at === undefined ? view.state.tr.replaceSelectionWith(node) : view.state.tr.insert(Math.min(at, view.state.doc.content.size), node);
        view.dispatch(tr);
      }
    })();
    return true;
  };

  const editor = useEditor(
    {
      extensions: partsFor(allows, looks, tones, words, srcOf, (provider) => embedName?.(provider) ?? provider),
      content: fitTo(value ?? EMPTY, allows) as JSONContent,
      editorProps: {
        attributes: {
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-labelledby': labelId,
          class: richTextEditorContentClass,
        },
        // What is pasted from a document keeps its headings at the nearest level there is, and loses pictures it cannot hold, said aloud.
        transformPastedHTML: (html) => {
          const page = new DOMParser().parseFromString(html, 'text/html');
          const pictures = [...page.querySelectorAll('img')].filter((image) => image.closest('figure[data-cms-image]') === null);
          pictures.forEach((image) => image.remove());
          if (pictures.length > 0) queueMicrotask(() => dropped.current?.(pictures.length));
          for (const heading of [...page.querySelectorAll('h1, h5, h6')]) {
            const next = page.createElement(heading.tagName === 'H1' ? 'h2' : 'h4');
            next.innerHTML = heading.innerHTML;
            heading.replaceWith(next);
          }
          return page.body.innerHTML;
        },
        handlePaste: (view, event) => {
          const files = [...(event.clipboardData?.files ?? [])];
          if (files.length > 0 && keepFiles(view, files)) return true;
          // An address of a video, map or player pasted on an empty line becomes the video.
          const typed = event.clipboardData?.getData('text/plain').trim() ?? '';
          const embed = /^https?:\/\/\S+$/.test(typed) ? embeds.current?.(typed) : undefined;
          const { $from, empty } = view.state.selection;
          const node = embed && view.state.schema.nodes['embed']?.create(embed);
          if (node && empty && $from.parent.type.name === 'paragraph' && $from.parent.content.size === 0) {
            view.dispatch(view.state.tr.replaceSelectionWith(node));
            return true;
          }
          return false;
        },
        handleDrop: (view, event) => {
          const files = [...(event.dataTransfer?.files ?? [])];
          if (files.length === 0) return false;
          const at = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          })?.pos;
          return keepFiles(view, files, at);
        },
      },
      onUpdate: ({ editor: current }) => {
        const next = current.isEmpty ? null : withoutEmptyEnd(fromEditor(current.getJSON()));
        said.current = next;
        changed.current(next);
        // A / typed on an empty line opens the menu of what can be added there.
        const { $from, empty } = current.state.selection;
        if (empty && $from.parent.type.name === 'paragraph' && $from.parent.textContent === '/' && $from.parentOffset === 1) {
          const box = boxRef.current?.getBoundingClientRect();
          const caret = current.view.coordsAtPos($from.pos);
          if (box)
            setSlash({
              at: $from.pos,
              left: caret.left - box.left,
              top: caret.bottom - box.top,
            });
        }
      },
    },
    [formatsKey],
  );

  // The attributes that change with the props.
  useEffect(() => {
    editor.setOptions({
      editorProps: {
        ...editor.options.editorProps,
        attributes: {
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-labelledby': labelId,
          'aria-required': String(isRequired),
          'aria-invalid': String(errorMessage !== undefined),
          ...(described !== '' && { 'aria-describedby': described }),
          class: richTextEditorContentClass,
        },
      },
    });
  }, [editor, labelId, described, isRequired, errorMessage]);

  // A value from outside (another entry, a save the server tidied) replaces the text.
  useEffect(() => {
    if (same(value, said.current)) return;
    said.current = value;
    editor.commands.setContent(fitTo(value ?? EMPTY, allows) as JSONContent, {
      emitUpdate: false,
    });
  }, [editor, value]);

  // The menu typing / opens stands under the cursor.
  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || !slash) return;
    anchor.style.left = `${slash.left}px`;
    anchor.style.top = `${slash.top}px`;
  }, [slash]);

  const marks: Tool[] = (
    [
      {
        name: words.bold,
        format: 'bold',
        icon: Bold,
        isActive: (e) => e.isActive('bold'),
        run: (e) => e.chain().focus().toggleBold().run(),
      },
      {
        name: words.italic,
        format: 'italic',
        icon: Italic,
        isActive: (e) => e.isActive('italic'),
        run: (e) => e.chain().focus().toggleItalic().run(),
      },
      {
        name: words.underline,
        format: 'underline',
        icon: Underline,
        isActive: (e) => e.isActive('underline'),
        run: (e) => e.chain().focus().toggleUnderline().run(),
      },
      {
        name: words.strike,
        format: 'strike',
        icon: Strikethrough,
        isActive: (e) => e.isActive('strike'),
        run: (e) => e.chain().focus().toggleStrike().run(),
      },
      {
        name: words.code,
        format: 'code',
        icon: Code,
        isActive: (e) => e.isActive('code'),
        run: (e) => e.chain().focus().toggleCode().run(),
      },
      {
        name: words.superscript,
        format: 'script',
        icon: SuperscriptIcon,
        isActive: (e) => e.isActive('superscript'),
        run: (e) => e.chain().focus().toggleSuperscript().run(),
      },
      {
        name: words.subscript,
        format: 'script',
        icon: SubscriptIcon,
        isActive: (e) => e.isActive('subscript'),
        run: (e) => e.chain().focus().toggleSubscript().run(),
      },
    ] satisfies Tool[]
  ).filter((tool) => allows(tool.format));
  const blocks: Tool[] = (
    [
      {
        name: words.heading,
        format: 'headings',
        icon: Heading2,
        isActive: (e) => e.isActive('heading', { level: 2 }),
        run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        name: words.subheading,
        format: 'headings',
        icon: Heading3,
        isActive: (e) => e.isActive('heading', { level: 3 }),
        run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
      },
      {
        name: words.smallHeading,
        format: 'headings',
        icon: Heading4,
        isActive: (e) => e.isActive('heading', { level: 4 }),
        run: (e) => e.chain().focus().toggleHeading({ level: 4 }).run(),
      },
      {
        name: words.bulletList,
        format: 'lists',
        icon: List,
        isActive: (e) => e.isActive('bulletList'),
        run: (e) => e.chain().focus().toggleBulletList().run(),
      },
      {
        name: words.numberedList,
        format: 'lists',
        icon: ListOrdered,
        isActive: (e) => e.isActive('orderedList'),
        run: (e) => e.chain().focus().toggleOrderedList().run(),
      },
      {
        name: words.quote,
        format: 'quotes',
        icon: TextQuote,
        isActive: (e) => e.isActive('blockquote'),
        run: (e) => e.chain().focus().toggleBlockquote().run(),
      },
    ] satisfies Tool[]
  ).filter((tool) => allows(tool.format));
  const bubbleMarks = marks.filter((tool) => tool.format !== 'script');

  const additions: Addition[] = [
    ...(allows('images') && onPickImage ? [{ id: 'image', label: words.picture, icon: Image }] : []),
    ...(allows('tables') ? [{ id: 'table', label: words.table, icon: TableIcon }] : []),
    ...(allows('codeBlocks') ? [{ id: 'codeBlock', label: words.codeBlock, icon: SquareCode }] : []),
    ...(allows('callouts') ? [{ id: 'callout', label: words.callout, icon: Info }] : []),
    ...(allows('details') ? [{ id: 'details', label: words.details, icon: ChevronsDownUp }] : []),
    ...(allows('embeds') ? [{ id: 'embed', label: words.embed, icon: MonitorPlay }] : []),
    ...(allows('buttons') ? [{ id: 'button', label: words.button, icon: MousePointerClick }] : []),
    ...(allows('divider') ? [{ id: 'divider', label: words.divider, icon: Minus }] : []),
  ];
  const blockStyles: Addition[] = blocks.map((tool) => ({
    id: `style:${tool.name}`,
    label: tool.name,
    icon: tool.icon,
    isBlockStyle: true,
  }));

  /** Adds what was chosen at the cursor. */
  const add = (id: string) => {
    if (id.startsWith('style:')) {
      blocks.find((tool) => `style:${tool.name}` === id)?.run(editor);
      return;
    }
    const chain = editor.chain().focus();
    switch (id) {
      case 'image':
        void onPickImage?.().then((picked) => {
          if (!picked) return;
          if (picked.src) known.current.set(picked.image, picked.src);
          editor
            .chain()
            .focus()
            .insertContent({
              type: 'image',
              attrs: { image: picked.image, alt: '' },
            })
            .run();
          // The picture is chosen at once, so what it shows is asked for next.
          const at = editor.state.selection.from - 1;
          if (editor.state.doc.nodeAt(at)?.type.name === 'image') editor.commands.setNodeSelection(at);
          setSettingsOpen(true);
        });
        return;
      case 'table':
        chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
        return;
      case 'codeBlock':
        chain.toggleCodeBlock().run();
        return;
      case 'callout':
        if (!chain.wrapIn('callout', { tone: tones[0]?.name ?? 'note' }).run())
          editor
            .chain()
            .focus()
            .insertContent({
              type: 'callout',
              attrs: { tone: tones[0]?.name ?? 'note' },
              content: [{ type: 'paragraph' }],
            })
            .run();
        return;
      case 'details':
        if (!chain.setDetails().run())
          editor
            .chain()
            .focus()
            .insertContent({
              type: 'details',
              content: [{ type: 'detailsSummary' }, { type: 'detailsContent', content: [{ type: 'paragraph' }] }],
            })
            .run();
        return;
      case 'embed':
        setAskEmbed(true);
        return;
      case 'button': {
        chain
          .insertContent({
            type: 'button',
            attrs: { label: words.button, href: '/' },
          })
          .run();
        const at = editor.state.selection.from - 1;
        if (editor.state.doc.nodeAt(at)?.type.name === 'button') editor.commands.setNodeSelection(at);
        setSettingsOpen(true);
        return;
      }
      case 'divider':
        chain.setHorizontalRule().run();
        return;
    }
  };

  // Which tools are on changes with the cursor, not with the props.
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      tools: [...marks, ...blocks].map((tool) => tool.isActive(current)),
      link: current.isActive('link'),
      linkAttrs: current.getAttributes('link') as Readonly<Record<string, unknown>>,
      colour: (current.getAttributes('colour')['name'] as string | undefined) ?? null,
      highlight: (current.getAttributes('highlight')['name'] as string | undefined) ?? null,
      align: ((current.getAttributes('paragraph')['align'] ?? current.getAttributes('heading')['align']) as string | null | undefined) ?? null,
      inTable: current.isActive('table'),
      focused: focusedOf(current),
      count: countOf(current),
    }),
  });

  const group = (tools: readonly Tool[], offset: number, name: string, isBubble = false) => (
    <Group aria-label={name}>
      {tools.map((tool) => {
        const index = [...marks, ...blocks].indexOf(tool);
        return (
          <Tooltip key={tool.name} content={tool.name} placement={isBubble ? 'bottom' : 'top'}>
            <ToggleButton aria-label={tool.name} isSelected={active.tools[index === -1 ? offset : index] ?? false} onChange={() => tool.run(editor)} className={richTextEditorToolClass}>
              <tool.icon aria-hidden size={richTextEditorToolIconSize} />
            </ToggleButton>
          </Tooltip>
        );
      })}
    </Group>
  );

  const lookMenu = (kind: 'colour' | 'highlight', choices: readonly RichTextLook[], current: string | null) => (
    <ToolMenu
      key={kind}
      label={kind === 'colour' ? words.colour : words.highlight}
      icon={kind === 'colour' ? Baseline : Highlighter}
      items={[
        {
          id: '',
          label: kind === 'colour' ? words.colourNone : words.highlightNone,
        },
        ...choices.map((look) => ({
          id: look.name,
          label: look.label,
          ...(look.swatch !== undefined && { swatch: look.swatch }),
        })),
      ]}
      selected={current ?? ''}
      onAction={(name) => {
        const chain = editor.chain().focus();
        if (name === '') chain.unsetMark(kind).run();
        else chain.setMark(kind, { name }).run();
      }}
    />
  );

  const alignMenu = allows('align') && (
    <ToolMenu
      key="align"
      label={words.align}
      icon={active.align === 'center' ? AlignCenter : active.align === 'right' ? AlignRight : AlignLeft}
      items={[
        { id: 'left', label: words.alignLeft, icon: AlignLeft },
        { id: 'center', label: words.alignCenter, icon: AlignCenter },
        { id: 'right', label: words.alignRight, icon: AlignRight },
      ]}
      selected={active.align ?? 'left'}
      onAction={(where) => {
        const align = where === 'left' ? null : where;
        editor.chain().focus().updateAttributes('paragraph', { align }).updateAttributes('heading', { align }).run();
      }}
    />
  );

  const tableMenu = allows('tables') && active.inTable && (
    <ToolMenu
      key="table"
      label={words.tableActions}
      icon={TableIcon}
      items={[
        { id: 'rowAbove', label: words.rowAbove },
        { id: 'rowBelow', label: words.rowBelow },
        { id: 'columnBefore', label: words.columnBefore },
        { id: 'columnAfter', label: words.columnAfter },
        { id: 'headerRow', label: words.headerRow },
        {
          id: 'mergeCells',
          label: words.mergeCells,
          isDisabled: !editor.can().mergeCells(),
        },
        {
          id: 'splitCell',
          label: words.splitCell,
          isDisabled: !editor.can().splitCell(),
        },
        { id: 'deleteRow', label: words.deleteRow, tone: 'danger' },
        { id: 'deleteColumn', label: words.deleteColumn, tone: 'danger' },
        { id: 'deleteTable', label: words.deleteTable, tone: 'danger' },
      ]}
      onAction={(id) => {
        const chain = editor.chain().focus();
        const done: Readonly<Record<string, () => boolean>> = {
          rowAbove: () => chain.addRowBefore().run(),
          rowBelow: () => chain.addRowAfter().run(),
          columnBefore: () => chain.addColumnBefore().run(),
          columnAfter: () => chain.addColumnAfter().run(),
          headerRow: () => chain.toggleHeaderRow().run(),
          mergeCells: () => chain.mergeCells().run(),
          splitCell: () => chain.splitCell().run(),
          deleteRow: () => chain.deleteRow().run(),
          deleteColumn: () => chain.deleteColumn().run(),
          deleteTable: () => chain.deleteTable().run(),
        };
        done[id]?.();
      }}
    />
  );

  const insertMenu = additions.length > 0 && <ToolMenu key="insert" label={words.insert} icon={Plus} items={additions} onAction={add} triggerRef={insertRef} hasCaret />;

  const settings = active.focused && (
    <NodeSettings
      key="settings"
      focused={active.focused}
      isOpen={settingsOpen}
      onOpenChange={setSettingsOpen}
      editor={editor}
      words={words}
      looks={looks}
      tones={tones}
      srcOf={srcOf}
      known={known.current}
      {...(onPickImage !== undefined && { onPickImage })}
      {...(renderLinkChooser !== undefined && { renderLinkChooser })}
      {...(embedFrom !== undefined && { embedFrom })}
    />
  );

  const groups: ReactNode[] = [
    marks.length > 0 && group(marks, 0, words.toolbar),
    (allows('colour') || allows('highlight')) && (
      <Group key="looks" aria-label={words.colour}>
        {allows('colour') && lookMenu('colour', looks.colours ?? [], active.colour)}
        {allows('highlight') && lookMenu('highlight', looks.highlights ?? [], active.highlight)}
      </Group>
    ),
    allows('link') && (
      <LinkTool
        key="link"
        editor={editor}
        isActive={active.link}
        attrs={active.linkAttrs}
        words={words}
        isOpen={linkOpen}
        onOpenChange={setLinkOpen}
        {...(renderLinkChooser !== undefined && { renderLinkChooser })}
      />
    ),
    blocks.length > 0 && group(blocks, marks.length, words.toolbar),
    alignMenu,
    (insertMenu || tableMenu || settings) && (
      <Group key="add" aria-label={words.insert}>
        {insertMenu}
        {tableMenu}
        {settings}
      </Group>
    ),
    words.shortcutList.length > 0 && additions.length > 0 && <Shortcuts key="shortcuts" words={words} />,
  ].filter(Boolean);

  return (
    <div className={richTextEditorClass}>
      <span id={labelId} className={richTextEditorLabelVariants({ isLabelHidden })}>
        {label}
        {isRequired && (
          <span aria-hidden className={richTextEditorRequiredMarkClass}>
            {' *'}
          </span>
        )}
      </span>
      <div
        ref={boxRef}
        className={richTextEditorBoxVariants({
          isInvalid: errorMessage !== undefined,
        })}
      >
        {groups.length > 0 && (
          <Toolbar aria-label={words.toolbar} className={richTextEditorToolbarClass}>
            {/* A line between the groups that are there, and none at either end. */}
            {groups.map((part, index) => (
              <Fragment key={index}>
                {index > 0 && <Separator orientation="vertical" className={richTextEditorSeparatorClass} />}
                {part}
              </Fragment>
            ))}
          </Toolbar>
        )}
        <EditorContent editor={editor} />
        {(bubbleMarks.length > 0 || allows('link')) && (
          <BubbleMenu
            editor={editor}
            className={richTextEditorBubbleLayerClass}
            options={{ placement: 'top', offset: 8, flip: true, shift: true }}
            shouldShow={({ editor: current, state }) => !state.selection.empty && !(state.selection instanceof NodeSelection) && current.isFocused}
          >
            <Toolbar aria-label={words.selection} className={richTextEditorBubbleClass}>
              {bubbleMarks.length > 0 && group(bubbleMarks, 0, words.selection, true)}
              {allows('link') && (
                <Tooltip content={words.link} placement="bottom">
                  <ToggleButton aria-label={words.link} isSelected={active.link} onChange={() => setLinkOpen(true)} className={richTextEditorToolClass}>
                    <Link2 aria-hidden size={richTextEditorToolIconSize} />
                  </ToggleButton>
                </Tooltip>
              )}
            </Toolbar>
          </BubbleMenu>
        )}
        <span ref={anchorRef} aria-hidden className={richTextEditorAnchorClass} />
        {slash && (
          <SlashMenu
            anchorRef={anchorRef}
            words={words}
            items={[...blockStyles, ...additions]}
            onClose={() => {
              setSlash(null);
              editor.commands.focus();
            }}
            onAction={(id) => {
              const at = slash.at;
              setSlash(null);
              // The / that opened the menu goes.
              if (editor.state.doc.textBetween(at - 1, at) === '/')
                editor
                  .chain()
                  .focus()
                  .deleteRange({ from: at - 1, to: at })
                  .run();
              add(id);
            }}
          />
        )}
        {askEmbed && embedFrom && (
          <EmbedAsk
            anchorRef={insertRef}
            words={words}
            embedFrom={embedFrom}
            onClose={() => setAskEmbed(false)}
            onEmbed={(embed) => {
              setAskEmbed(false);
              editor.chain().focus().insertContent({ type: 'embed', attrs: embed }).run();
            }}
          />
        )}
      </div>
      {(allows('images') || allows('tables')) && active.count.words > 0 && <p className={richTextEditorCountClass}>{words.count(active.count.words, active.count.minutes)}</p>}
      {description !== undefined && (
        <p id={descriptionId} className={richTextEditorDescriptionClass}>
          {description}
        </p>
      )}
      {errorMessage !== undefined && (
        <p id={errorId} className={richTextEditorErrorClass}>
          {errorMessage}
        </p>
      )}
    </div>
  );
}

interface ToolMenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: LucideIcon;
  readonly swatch?: string;
  readonly isDisabled?: boolean;
  readonly tone?: 'danger';
}

interface ToolMenuProps {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly items: readonly ToolMenuItem[];
  readonly onAction: (id: string) => void;
  /** The item that is on, marked as chosen. */
  readonly selected?: string;
  readonly triggerRef?: RefObject<HTMLButtonElement | null>;
  readonly hasCaret?: boolean;
}

/** A tool of the toolbar that opens a short list: colours, where text stands, what can be added. */
function ToolMenu({ label, icon: Icon, items, onAction, selected, triggerRef, hasCaret = false }: ToolMenuProps) {
  return (
    <MenuTrigger>
      <Tooltip content={label}>
        <AriaButton aria-label={label} className={hasCaret ? richTextEditorToolMenuClass : richTextEditorToolClass} {...(triggerRef !== undefined && { ref: triggerRef })}>
          <Icon aria-hidden size={richTextEditorToolIconSize} />
          {hasCaret && <ChevronDown aria-hidden size={richTextEditorMenuIconSize} />}
        </AriaButton>
      </Tooltip>
      <Popover placement="bottom start" className={richTextEditorMenuPanelClass}>
        <AriaMenu
          aria-label={label}
          className={richTextEditorMenuClass}
          onAction={(key) => onAction(String(key))}
          disabledKeys={items.filter((item) => item.isDisabled).map((item) => item.id)}
          {...(selected !== undefined && {
            selectionMode: 'single' as const,
            selectedKeys: [selected],
          })}
        >
          {items.map((item) => (
            <MenuItem
              key={item.id}
              id={item.id}
              textValue={item.label}
              className={richTextEditorMenuItemClass({
                tone: item.tone ?? 'default',
              })}
            >
              {item.swatch !== undefined ? (
                <svg aria-hidden="true" viewBox="0 0 16 16" className={richTextEditorSwatchClass}>
                  <circle cx="8" cy="8" r="7" fill={item.swatch} />
                </svg>
              ) : (
                item.icon && <item.icon aria-hidden size={richTextEditorMenuIconSize} />
              )}
              {item.label}
            </MenuItem>
          ))}
        </AriaMenu>
      </Popover>
    </MenuTrigger>
  );
}

interface LinkToolProps {
  readonly editor: Editor;
  readonly isActive: boolean;
  readonly attrs: Readonly<Record<string, unknown>>;
  readonly words: RichTextEditorWords;
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly renderLinkChooser?: RichTextEditorProps['renderLinkChooser'];
}

const linkValueOf = (attrs: Readonly<Record<string, unknown>>): RichTextLinkValue | undefined => {
  if (typeof attrs['entryType'] === 'string' && typeof attrs['entry'] === 'string') return { kind: 'entry', type: attrs['entryType'], entry: attrs['entry'] };
  return typeof attrs['href'] === 'string' && attrs['href'] !== '' ? { kind: 'address', href: attrs['href'] } : undefined;
};
const linkAttrsOf = (value: RichTextLinkValue | undefined) =>
  value === undefined ? undefined : value.kind === 'entry' ? { href: null, entryType: value.type, entry: value.entry } : { href: value.href.trim(), entryType: null, entry: null };

/** The link button, with the small panel its place, its tab and what search engines are told are chosen in. */
function LinkTool({ editor, isActive, attrs, words, isOpen, onOpenChange, renderLinkChooser }: LinkToolProps) {
  const [leads, setLeads] = useState<RichTextLinkValue | undefined>(undefined);
  const [newTab, setNewTab] = useState(false);
  const [rel, setRel] = useState('');
  useEffect(() => {
    if (!isOpen) return;
    setLeads(linkValueOf(attrs));
    setNewTab(attrs['target'] === '_blank');
    setRel(typeof attrs['rel'] === 'string' && (attrs['rel'] === 'nofollow' || attrs['rel'] === 'sponsored') ? attrs['rel'] : '');
    // Read once as the panel opens; what is typed after is the panel's own.
  }, [isOpen]);
  const apply = () => {
    const link = editor.chain().focus().extendMarkRange('link');
    const where = linkAttrsOf(leads);
    if (where === undefined || (where.href !== null && (where.href === '' || !isSafeLink(where.href)))) link.unsetLink().run();
    else
      link
        .setMark('link', {
          ...where,
          target: newTab ? '_blank' : null,
          rel: rel === '' ? null : rel,
        })
        .run();
    onOpenChange(false);
  };
  const typed = leads?.kind === 'address' ? leads.href : '';
  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
      <Tooltip content={words.link}>
        <ToggleButton aria-label={words.link} isSelected={isActive} onChange={() => onOpenChange(true)} className={richTextEditorToolClass}>
          <Link2 aria-hidden size={richTextEditorToolIconSize} />
        </ToggleButton>
      </Tooltip>
      <Popover placement="bottom start" isNonModal className={richTextEditorLinkPanelClass}>
        <Dialog aria-label={words.link} className={richTextEditorLinkOuterClass}>
          <form
            className={richTextEditorLinkDialogClass}
            onSubmit={(event) => {
              event.preventDefault();
              // The panel is drawn elsewhere on the page, but React still counts it as inside the
              // form the editor is in. Applying a link must not send that form.
              event.stopPropagation();
              apply();
            }}
          >
            {renderLinkChooser ? (
              renderLinkChooser(leads, setLeads)
            ) : (
              <TextField label={words.linkAddress} description={words.linkHelp} value={typed} onChange={(href) => setLeads(href.trim() === '' ? undefined : { kind: 'address', href })} autoFocus />
            )}
            <Checkbox label={words.linkNewTab} isSelected={newTab} onChange={setNewTab} />
            <Select
              label={words.linkRel}
              options={[
                { id: '', label: words.linkRelNone },
                { id: 'nofollow', label: words.linkRelNofollow },
                { id: 'sponsored', label: words.linkRelSponsored },
              ]}
              value={rel}
              onChange={setRel}
            />
            <div className={richTextEditorLinkActionsClass}>
              {isActive && (
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => {
                    editor.chain().focus().extendMarkRange('link').unsetLink().run();
                    onOpenChange(false);
                  }}
                >
                  {words.linkRemove}
                </Button>
              )}
              <Button variant="primary" size="sm" type="submit">
                {words.linkApply}
              </Button>
            </div>
          </form>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}

interface NodeSettingsProps {
  readonly focused: Focused;
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly editor: Editor;
  readonly words: RichTextEditorWords;
  readonly looks: RichTextEditorLooks;
  readonly tones: readonly RichTextLook[];
  readonly srcOf: (image: string) => string | undefined;
  readonly known: Map<string, string>;
  readonly onPickImage?: RichTextEditorProps['onPickImage'];
  readonly renderLinkChooser?: RichTextEditorProps['renderLinkChooser'];
  readonly embedFrom?: RichTextEditorProps['embedFrom'];
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** What can be set on the picture, video, button, code, callout or table the cursor is at, changed as it is typed. */
function NodeSettings({ focused, isOpen, onOpenChange, editor, words, looks, tones, srcOf, known, onPickImage, renderLinkChooser, embedFrom }: NodeSettingsProps) {
  const { type, attrs, pos } = focused;
  const set = (changes: Readonly<Record<string, unknown>>) => setAttrs(editor, pos, changes);
  const remove = () => {
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        const node = tr.doc.nodeAt(pos);
        if (!node) return false;
        tr.delete(pos, pos + node.nodeSize);
        return true;
      })
      .run();
    onOpenChange(false);
  };
  const lookChoice = (choices: readonly RichTextLook[] | undefined, chosen: unknown, label: string, key: string) =>
    choices && choices.length > 0 ? (
      <Segmented
        label={label}
        isLabelShown
        options={[
          { id: '', label: words.lookDefault },
          ...choices.map((look) => ({
            id: look.name,
            label: look.label,
            ...(look.swatch !== undefined && { swatch: look.swatch }),
          })),
        ]}
        selected={text(chosen)}
        onChange={(name) => set({ [key]: name === '' ? null : name })}
      />
    ) : null;
  const leads = linkValueOf(attrs);
  const chooseLink = (onLeads: (value: RichTextLinkValue | undefined) => void, current: RichTextLinkValue | undefined, label: string) =>
    renderLinkChooser ? (
      renderLinkChooser(current, onLeads)
    ) : (
      <TextField
        label={label}
        description={words.linkHelp}
        value={current?.kind === 'address' ? current.href : ''}
        onChange={(href) => onLeads(href.trim() === '' ? undefined : { kind: 'address', href })}
      />
    );
  const [address, setAddress] = useState('');
  const fields = (() => {
    switch (type) {
      case 'image': {
        const src = srcOf(text(attrs['image']));
        return (
          <>
            {src !== undefined && <img src={src} alt="" className={richTextEditorPicturePreviewClass} />}
            {onPickImage && (
              <Button
                variant="secondary"
                size="sm"
                onPress={() =>
                  void onPickImage(text(attrs['image'])).then((picked) => {
                    if (!picked) return;
                    if (picked.src) known.set(picked.image, picked.src);
                    set({ image: picked.image });
                  })
                }
              >
                {words.pictureChange}
              </Button>
            )}
            <TextField label={words.pictureAlt} description={words.pictureAltHelp} value={text(attrs['alt'])} onChange={(alt) => set({ alt })} autoFocus />
            <TextField label={words.pictureCaption} value={text(attrs['caption'])} onChange={(caption) => set({ caption: caption === '' ? null : caption })} />
            <Segmented
              label={words.pictureSize}
              isLabelShown
              options={[
                { id: 'text', label: words.pictureSizeText },
                { id: 'wide', label: words.pictureSizeWide },
                { id: 'full', label: words.pictureSizeFull },
              ]}
              selected={text(attrs['size']) || 'text'}
              onChange={(size) => set({ size: size === 'text' ? null : size })}
            />
            <TextField
              label={words.pictureLink}
              description={words.linkHelp}
              value={text(attrs['href'])}
              onChange={(href) =>
                set({
                  href: href.trim() === '' || !isSafeLink(href.trim()) ? null : href.trim(),
                })
              }
            />
          </>
        );
      }
      case 'embed': {
        const found = address.trim() === '' ? undefined : embedFrom?.(address.trim());
        return (
          <>
            <TextField label={words.embedTitle} value={text(attrs['title'])} onChange={(title) => title.trim() !== '' && set({ title })} autoFocus />
            <TextField
              label={words.embedAddress}
              description={words.embedHelp}
              value={address}
              onChange={(next) => {
                setAddress(next);
                const embed = next.trim() === '' ? undefined : embedFrom?.(next.trim());
                if (embed) set({ provider: embed.provider, id: embed.id });
              }}
              {...(address.trim() !== '' && !found && { errorMessage: words.embedNotKnown })}
            />
          </>
        );
      }
      case 'button':
        return (
          <>
            <TextField label={words.buttonLabel} value={text(attrs['label'])} onChange={(label) => label.trim() !== '' && set({ label })} autoFocus />
            {chooseLink((value) => value && set(linkAttrsOf(value) ?? {}), leads, words.linkAddress)}
            {lookChoice(looks.buttons, attrs['style'], words.buttonStyle, 'style')}
          </>
        );
      case 'codeBlock':
        return (
          <TextField
            label={words.codeLanguage}
            description={words.codeLanguageHelp}
            value={text(attrs['language'])}
            onChange={(language) =>
              set({
                language: /^[a-z0-9][a-z0-9+#.-]{0,29}$/i.test(language) ? language : null,
              })
            }
            autoFocus
          />
        );
      case 'callout':
        return (
          <Segmented
            label={words.calloutTone}
            isLabelShown
            options={tones.map((tone) => ({
              id: tone.name,
              label: tone.label,
              ...(tone.swatch !== undefined && { swatch: tone.swatch }),
            }))}
            selected={text(attrs['tone'])}
            onChange={(tone) => set({ tone })}
          />
        );
      case 'table':
        return lookChoice(looks.tables, attrs['style'], words.tableStyle, 'style');
    }
  })();
  if (fields === null) return null;
  const removable = type === 'image' || type === 'embed' || type === 'button';
  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
      <Tooltip content={words.settings}>
        <AriaButton aria-label={words.settings} className={richTextEditorToolClass}>
          <SlidersHorizontal aria-hidden size={richTextEditorToolIconSize} />
        </AriaButton>
      </Tooltip>
      <Popover placement="bottom start" isNonModal className={richTextEditorLinkPanelClass}>
        <Dialog aria-label={words.settings} className={richTextEditorLinkOuterClass}>
          <div className={richTextEditorLinkDialogClass}>
            {fields}
            <div className={richTextEditorLinkActionsClass}>
              {removable && (
                <Button variant="ghost" size="sm" onPress={remove}>
                  {words.remove}
                </Button>
              )}
            </div>
          </div>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}

interface SlashMenuProps {
  readonly anchorRef: RefObject<HTMLSpanElement | null>;
  readonly words: RichTextEditorWords;
  readonly items: readonly Addition[];
  readonly onAction: (id: string) => void;
  readonly onClose: () => void;
}

/** The menu typing / on an empty line opens: what that line can become, found by typing. */
function SlashMenu({ anchorRef, words, items, onAction, onClose }: SlashMenuProps) {
  const { contains } = useFilter({ sensitivity: 'base' });
  return (
    <Popover triggerRef={anchorRef} isOpen onOpenChange={(isOpen) => !isOpen && onClose()} placement="bottom start" className={richTextEditorMenuPanelClass}>
      <Dialog aria-label={words.slash} className={richTextEditorLinkOuterClass}>
        <Autocomplete filter={contains}>
          <SearchField aria-label={words.slashSearch} autoFocus className={richTextEditorSlashSearchClass}>
            <Search aria-hidden size={richTextEditorMenuIconSize} />
            <Input placeholder={words.slashSearch} className={richTextEditorSlashInputClass} />
          </SearchField>
          <AriaMenu
            aria-label={words.slash}
            className={richTextEditorMenuClass}
            onAction={(key) => onAction(String(key))}
            renderEmptyState={() => <div className={richTextEditorSlashEmptyClass}>{words.slashEmpty}</div>}
          >
            {items.map((item) => (
              <MenuItem key={item.id} id={item.id} textValue={item.label} className={richTextEditorMenuItemClass({ tone: 'default' })}>
                <item.icon aria-hidden size={richTextEditorMenuIconSize} />
                {item.label}
              </MenuItem>
            ))}
          </AriaMenu>
        </Autocomplete>
      </Dialog>
    </Popover>
  );
}

interface EmbedAskProps {
  readonly anchorRef: RefObject<HTMLButtonElement | null>;
  readonly words: RichTextEditorWords;
  readonly embedFrom: NonNullable<RichTextEditorProps['embedFrom']>;
  readonly onEmbed: (embed: RichTextEmbedValue) => void;
  readonly onClose: () => void;
}

/** Asks for the address of a video, a map or a player, and adds it. */
function EmbedAsk({ anchorRef, words, embedFrom, onEmbed, onClose }: EmbedAskProps) {
  const [address, setAddress] = useState('');
  const [tried, setTried] = useState(false);
  return (
    <Popover triggerRef={anchorRef} isOpen onOpenChange={(isOpen) => !isOpen && onClose()} placement="bottom start" className={richTextEditorLinkPanelClass}>
      <Dialog aria-label={words.embed} className={richTextEditorLinkOuterClass}>
        <form
          className={richTextEditorLinkDialogClass}
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const embed = embedFrom(address.trim());
            if (embed) onEmbed(embed);
            else setTried(true);
          }}
        >
          <TextField label={words.embedAddress} description={words.embedHelp} value={address} onChange={setAddress} autoFocus {...(tried && { errorMessage: words.embedNotKnown })} />
          <div className={richTextEditorLinkActionsClass}>
            <Button variant="primary" size="sm" type="submit">
              {words.embed}
            </Button>
          </div>
        </form>
      </Dialog>
    </Popover>
  );
}

/** The keys that do things in the text, in a small panel. */
function Shortcuts({ words }: { readonly words: RichTextEditorWords }) {
  return (
    <DialogTrigger>
      <Tooltip content={words.shortcuts}>
        <AriaButton aria-label={words.shortcuts} className={richTextEditorToolClass}>
          <Keyboard aria-hidden size={richTextEditorToolIconSize} />
        </AriaButton>
      </Tooltip>
      <Popover placement="bottom end" className={richTextEditorLinkPanelClass}>
        <Dialog aria-label={words.shortcuts} className={richTextEditorLinkOuterClass}>
          <dl className={richTextEditorShortcutListClass}>
            {words.shortcutList.map((shortcut) => (
              <div key={shortcut.keys} className={richTextEditorShortcutRowClass}>
                <dt>{shortcut.does}</dt>
                <dd className={richTextEditorShortcutKeysClass}>{shortcut.keys}</dd>
              </div>
            ))}
          </dl>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
