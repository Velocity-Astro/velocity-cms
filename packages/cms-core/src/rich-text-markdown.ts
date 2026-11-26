import {
  embedAddress,
  embedFromUrl,
  isLookName,
  isSafeLink,
  type RichText,
  type RichTextAlign,
  type RichTextBlock,
  type RichTextImage,
  type RichTextInline,
  type RichTextLinkAttrs,
  type RichTextList,
  type RichTextMark,
  type RichTextParagraph,
  type RichTextTableCell,
} from './rich-text.js';

/*
 * Markdown, as an agent, an import or a person writes it, and formatted text, both ways. What
 * Markdown has no way to say is written the way GitHub, Pandoc and most writers already know:
 * `<u>`, `<sup>` and `<sub>` for underline and raised and lowered words, `[words]{colour=brand}`
 * for a look of the template, `{align=center}` at the end of a line, `> [!TIP]` for a callout,
 * `<details>` with its `<summary>`, a link alone on its line marked `{button}` or `{embed}`, and
 * `entry:<type>/<group>` for a link to an entry of the site. What it reads, it writes back the same.
 */

type Attrs = Readonly<Record<string, string | true>>;

/** `{key=value .flag key="two words"}`, as `{ key: 'value', flag: true }`. */
function readAttrs(text: string): Attrs | undefined {
  const inside = /^\{([^{}]*)\}$/.exec(text.trim())?.[1];
  if (inside === undefined) return undefined;
  const found: Record<string, string | true> = {};
  for (const [, key, quoted, bare] of inside.matchAll(/\.?([a-z][a-z0-9_-]*)(?:=(?:"((?:\\.|[^"\\])*)"|([^\s"]+)))?/gi)) {
    if (key === undefined) continue;
    found[key.toLowerCase()] = quoted !== undefined ? quoted.replace(/\\(.)/g, '$1') : (bare ?? true);
  }
  return found;
}

const writeAttrs = (attrs: Readonly<Record<string, string | true | undefined>>) => {
  const said = Object.entries(attrs)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => (value === true ? key : /^[\w-]+$/.test(String(value)) ? `${key}=${value}` : `${key}="${String(value).replace(/["\\]/g, '\\$&')}"`));
  return said.length > 0 ? `{${said.join(' ')}}` : '';
};

/** A link's address as it is written: an entry as `entry:<type>/<group>`. */
const ENTRY_HREF = /^entry:([^/\s]+)\/(\S+)$/;
function leadsTo(href: string): Pick<RichTextLinkAttrs, 'href' | 'entryType' | 'entry'> | undefined {
  const entry = ENTRY_HREF.exec(href);
  if (entry) return { entryType: entry[1] ?? '', entry: entry[2] ?? '' };
  return isSafeLink(href) ? { href } : undefined;
}
const hrefWritten = (attrs: Pick<RichTextLinkAttrs, 'href' | 'entryType' | 'entry'>) => attrs.href ?? `entry:${attrs.entryType ?? ''}/${attrs.entry ?? ''}`;
const linkExtras = (attrs: Attrs | undefined): Pick<RichTextLinkAttrs, 'target' | 'rel'> => ({
  ...(attrs?.['target'] === '_blank' && { target: '_blank' as const }),
  ...((attrs?.['rel'] === 'nofollow' || attrs?.['rel'] === 'sponsored') && { rel: attrs['rel'] }),
});

/** Where the bracket that opens at `from` closes, minding backslashes and brackets inside. */
function closing(text: string, from: number, open: string, close: string): number {
  let depth = 0;
  for (let at = from; at < text.length; at++) {
    const character = text[at];
    if (character === '\\') {
      at++;
      continue;
    }
    if (character === open) depth++;
    else if (character === close && --depth === 0) return at;
  }
  return -1;
}

/** A link written after its words, `(address)` or `(<address with spaces>)`, from `from`: what it says and where it ends. */
function readTarget(text: string, from: number): { href: string; end: number } | undefined {
  if (text[from] !== '(') return undefined;
  if (text[from + 1] === '<') {
    const end = text.indexOf('>)', from);
    return end < 0 ? undefined : { href: text.slice(from + 2, end), end: end + 2 };
  }
  const end = closing(text, from, '(', ')');
  return end < 0 ? undefined : { href: text.slice(from + 1, end).trim(), end: end + 1 };
}

/** `{...}` right after `from`, and where it ends. */
function attrsAt(text: string, from: number): { attrs: Attrs; end: number } | undefined {
  if (text[from] !== '{') return undefined;
  const end = text.indexOf('}', from);
  const attrs = end < 0 ? undefined : readAttrs(text.slice(from, end + 1));
  return attrs && { attrs, end: end + 1 };
}

const DELIMITED: readonly { open: string; close: string; mark: RichTextMark }[] = [
  { open: '**', close: '**', mark: { type: 'bold' } },
  { open: '__', close: '__', mark: { type: 'bold' } },
  { open: '~~', close: '~~', mark: { type: 'strike' } },
  { open: '<u>', close: '</u>', mark: { type: 'underline' } },
  { open: '<sup>', close: '</sup>', mark: { type: 'superscript' } },
  { open: '<sub>', close: '</sub>', mark: { type: 'subscript' } },
  { open: '*', close: '*', mark: { type: 'italic' } },
  { open: '_', close: '_', mark: { type: 'italic' } },
];

/** Where a mark opened at `from` closes, skipping what backslashes guard. */
function closes(text: string, from: number, close: string): number {
  for (let at = from; at < text.length; at++) {
    if (text[at] === '\\') {
      at++;
      continue;
    }
    if (text.startsWith(close, at) && at > from) return at;
  }
  return -1;
}

const ESCAPABLE = /[\\`*_[\](){}#>+\-.!~<|]/;

function markdownInline(text: string): RichTextInline[] {
  const parts: RichTextInline[] = [];
  const add = (words: string, marks: readonly RichTextMark[]) => {
    const lines = words.split('\n');
    lines.forEach((line, index) => {
      if (index > 0) parts.push({ type: 'hardBreak' });
      if (line === '') return;
      // Words in pieces (a guarded mark between them) are one run of text when they carry the same marks.
      const last = index === 0 ? parts.at(-1) : undefined;
      if (last?.type === 'text' && JSON.stringify(last.marks ?? []) === JSON.stringify(marks)) parts[parts.length - 1] = { ...last, text: last.text + line };
      else parts.push(marks.length > 0 ? { type: 'text', text: line, marks } : { type: 'text', text: line });
    });
  };
  const walk = (rest: string, marks: readonly RichTextMark[]): void => {
    let words = '';
    let at = 0;
    const flush = () => {
      add(words, marks);
      words = '';
    };
    while (at < rest.length) {
      const character = rest[at] ?? '';
      // A backslash before a mark means the mark itself. It comes first, so what it guards is never read as markup.
      if (character === '\\' && ESCAPABLE.test(rest[at + 1] ?? '')) {
        words += rest[at + 1];
        at += 2;
        continue;
      }
      if (rest.startsWith('<br>', at)) {
        flush();
        parts.push({ type: 'hardBreak' });
        at += 4;
        continue;
      }
      if (character === '`') {
        const end = rest.indexOf('`', at + 1);
        if (end > at + 1) {
          flush();
          add(rest.slice(at + 1, end), [...marks, { type: 'code' }]);
          at = end + 1;
          continue;
        }
      }
      if (character === '!' && rest[at + 1] === '[') {
        // A picture inside a line has no place in formatted text: it is left out, and an import says so.
        const end = closing(rest, at + 1, '[', ']');
        const target = end < 0 ? undefined : readTarget(rest, end + 1);
        if (target) {
          flush();
          at = attrsAt(rest, target.end)?.end ?? target.end;
          continue;
        }
      }
      if (character === '[') {
        const end = closing(rest, at, '[', ']');
        const label = end < 0 ? undefined : rest.slice(at + 1, end);
        const target = label === undefined ? undefined : readTarget(rest, end + 1);
        const after = attrsAt(rest, target ? target.end : end + 1);
        if (label !== undefined && target) {
          flush();
          const leads = leadsTo(target.href);
          walk(label, leads ? [...marks, { type: 'link', attrs: { ...leads, ...linkExtras(after?.attrs) } }] : marks);
          at = after?.end ?? target.end;
          continue;
        }
        if (label !== undefined && after) {
          const looks: RichTextMark[] = [];
          if (isLookName(after.attrs['colour'])) looks.push({ type: 'colour', attrs: { name: after.attrs['colour'] } });
          if (isLookName(after.attrs['highlight'])) looks.push({ type: 'highlight', attrs: { name: after.attrs['highlight'] } });
          flush();
          walk(label, [...marks, ...looks]);
          at = after.end;
          continue;
        }
      }
      const delimited = DELIMITED.find((candidate) => rest.startsWith(candidate.open, at));
      if (delimited) {
        const end = closes(rest, at + delimited.open.length, delimited.close);
        if (end > 0) {
          flush();
          walk(rest.slice(at + delimited.open.length, end), [...marks, delimited.mark]);
          at = end + delimited.close.length;
          continue;
        }
      }
      words += character;
      at++;
    }
    flush();
  };
  walk(text, []);
  return parts;
}

/** `{align=center}` at the end of a line, taken off it. */
function alignOf(line: string): { line: string; align?: RichTextAlign } {
  const found = /\s*\{align=(center|right)\}\s*$/.exec(line);
  return found ? { line: line.slice(0, found.index), align: found[1] as RichTextAlign } : { line };
}

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const FENCE = /^(\s*)(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
/** A picture alone on its line, perhaps inside a link, perhaps with its size. */
const IMAGE_LINE = /^\s*(\[)?!\[/;

/** The cells of one row of a table, split at bars no backslash guards. */
function cellsOf(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
  const cells: string[] = [];
  let cell = '';
  for (let at = 0; at < trimmed.length; at++) {
    if (trimmed[at] === '\\' && trimmed[at + 1] === '|') {
      cell += '|';
      at++;
    } else if (trimmed[at] === '|') {
      cells.push(cell.trim());
      cell = '';
    } else cell += trimmed[at];
  }
  cells.push(cell.trim());
  return cells;
}

const cellParagraphs = (text: string): RichTextParagraph[] => {
  const paragraphs = text.split(/<br>\s*<br>/).map((part): RichTextParagraph => {
    const content = markdownInline(part.trim());
    return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' };
  });
  return paragraphs.length > 0 ? paragraphs : [{ type: 'paragraph' }];
};

/** A picture alone on its line, `![alt](name "caption"){size=wide}`, perhaps inside `[...](address)`. */
function imageLine(line: string): RichTextImage | undefined {
  const text = line.trim();
  const linked = text.startsWith('[');
  const start = linked ? 1 : 0;
  const altEnd = closing(text, start + 1, '[', ']');
  if (altEnd < 0) return undefined;
  const target = readTarget(text, altEnd + 1);
  if (!target) return undefined;
  const [, name, caption] = /^(\S+|<[^>]*>)(?:\s+"((?:\\.|[^"\\])*)")?$/.exec(target.href) ?? [];
  let at = target.end;
  let href: string | undefined;
  if (linked) {
    if (text[at] !== ']') return undefined;
    const around = readTarget(text, at + 1);
    if (!around) return undefined;
    href = around.href;
    at = around.end;
  }
  const attrs = attrsAt(text, at);
  if ((attrs?.end ?? at) !== text.length || name === undefined) return undefined;
  const image = name.replace(/^<|>$/g, '');
  // An image of the site is a name of its library. An address is not one, so it is left out, as before.
  if (image === '' || /[/:?#]/.test(image)) return undefined;
  const size = attrs?.attrs['size'];
  return {
    type: 'image',
    attrs: {
      image,
      alt: text.slice(start + 2, altEnd).replace(/\\(.)/g, '$1'),
      ...(caption !== undefined && caption !== '' && { caption: caption.replace(/\\(.)/g, '$1') }),
      ...(href !== undefined && isSafeLink(href) && { href }),
      ...((size === 'wide' || size === 'full') && { size }),
    },
  };
}

/** A link alone on its line marked `{button}` or `{embed}`, or a bare address of a video, map or player. */
function lineOnItsOwn(line: string): RichTextBlock | undefined {
  const text = line.trim();
  if (!text.startsWith('[')) {
    const embed = /^https?:\/\/\S+$/.test(text) ? embedFromUrl(text) : undefined;
    return embed && { type: 'embed', attrs: embed };
  }
  const end = closing(text, 0, '[', ']');
  const target = end < 0 ? undefined : readTarget(text, end + 1);
  const after = target && attrsAt(text, target.end);
  if (!target || !after || after.end !== text.length) return undefined;
  const label = markdownInline(text.slice(1, end))
    .map((part) => (part.type === 'text' ? part.text : ' '))
    .join('')
    .trim();
  if (after.attrs['embed'] !== undefined) {
    const embed = embedFromUrl(target.href);
    return embed && { type: 'embed', attrs: { ...embed, ...(label !== '' && { title: label }) } };
  }
  if (after.attrs['button'] !== undefined && label !== '') {
    const leads = leadsTo(target.href);
    const style = after.attrs['button'];
    return leads && { type: 'button', attrs: { label, ...leads, ...(isLookName(style) && { style }) } };
  }
  return undefined;
}

function markdownBlocks(lines: readonly string[]): RichTextBlock[] {
  const blocks: RichTextBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    const { line: text, align } = alignOf(paragraph.join('\n').trim());
    const content = text === '' ? [] : markdownInline(text);
    if (content.length > 0) blocks.push({ type: 'paragraph', ...(align && { attrs: { align } }), content });
    paragraph = [];
  };
  for (let at = 0; at < lines.length; at++) {
    const line = lines[at] ?? '';
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(alignOf(line).line);
    const fence = FENCE.exec(line);
    if (line.trim() === '') {
      flush();
    } else if (fence) {
      flush();
      const code: string[] = [];
      const mark = fence[2] ?? '```';
      for (at++; at < lines.length && !(lines[at] ?? '').trim().startsWith(mark); at++) code.push(lines[at] ?? '');
      const text = code.join('\n');
      const language = fence[3];
      blocks.push({ type: 'codeBlock', ...(language && { attrs: { language } }), ...(text !== '' && { content: [{ type: 'text', text }] }) });
    } else if (heading) {
      flush();
      const level = heading[1]?.length ?? 2;
      const { align } = alignOf(line);
      blocks.push({ type: 'heading', attrs: { level: level <= 2 ? 2 : level === 3 ? 3 : 4, ...(align && { align }) }, content: markdownInline(heading[2] ?? '') });
    } else if (/^\s*<details>\s*$/i.test(line)) {
      flush();
      const inner: string[] = [];
      let depth = 1;
      for (at++; at < lines.length; at++) {
        const next = lines[at] ?? '';
        if (/^\s*<details>\s*$/i.test(next)) depth++;
        if (/^\s*<\/details>\s*$/i.test(next) && --depth === 0) break;
        inner.push(next);
      }
      const summaryAt = inner.findIndex((next) => /<summary>/i.test(next));
      const summary = summaryAt < 0 ? '' : (/<summary>(.*?)<\/summary>/i.exec(inner[summaryAt] ?? '')?.[1] ?? '');
      const content = markdownBlocks(inner.filter((_, index) => index !== summaryAt)).filter((block): block is RichTextParagraph | RichTextList => block.type === 'paragraph' || block.type === 'bulletList' || block.type === 'orderedList');
      const words = markdownInline(summary.trim());
      blocks.push({ type: 'details', content: [{ type: 'detailsSummary', ...(words.length > 0 && { content: words }) }, { type: 'detailsContent', content: content.length > 0 ? content : [{ type: 'paragraph' }] }] });
    } else if (/^\s*>/.test(line)) {
      flush();
      const quoted: string[] = [];
      while (at < lines.length && /^\s*>/.test(lines[at] ?? '')) quoted.push((lines[at++] ?? '').replace(/^\s*>\s?/, ''));
      at--;
      const tone = /^\[!([A-Za-z][\w-]*)\]\s*$/.exec(quoted[0] ?? '')?.[1]?.toLowerCase();
      if (tone !== undefined && isLookName(tone)) {
        const content = markdownBlocks(quoted.slice(1)).filter((block): block is RichTextParagraph | RichTextList => block.type === 'paragraph' || block.type === 'bulletList' || block.type === 'orderedList');
        blocks.push({ type: 'callout', attrs: { tone }, content: content.length > 0 ? content : [{ type: 'paragraph' }] });
      } else blocks.push({ type: 'blockquote', content: markdownBlocks(quoted) });
    } else if (line.trim().startsWith('|') && TABLE_RULE.test(lines[at + 1] ?? '')) {
      flush();
      const head = cellsOf(line);
      const rows: string[][] = [];
      for (at += 2; at < lines.length && (lines[at] ?? '').trim().startsWith('|'); at++) rows.push(cellsOf(lines[at] ?? ''));
      const attrs = readAttrs(lines[at] ?? '');
      if (!attrs) at--;
      const headless = attrs?.['header'] === 'none';
      const width = Math.max(head.length, ...rows.map((row) => row.length));
      const row = (cells: readonly string[], header: boolean) => ({
        type: 'tableRow' as const,
        content: Array.from({ length: width }, (_, index): RichTextTableCell => ({ type: header ? 'tableHeader' : 'tableCell', content: cellParagraphs(cells[index] ?? '') })),
      });
      const style = attrs?.['style'];
      blocks.push({ type: 'table', ...(isLookName(style) && { attrs: { style } }), content: [row(head, !headless), ...rows.map((cells) => row(cells, false))] });
    } else if (LIST_ITEM.test(line)) {
      flush();
      const taken: string[] = [];
      // An item goes on over lines indented under it, and over an empty line between two of them.
      const goesOn = (index: number) => LIST_ITEM.test(lines[index] ?? '') || /^\s{2,}\S/.test(lines[index] ?? '') || ((lines[index] ?? '').trim() === '' && /^\s{2,}\S/.test(lines[index + 1] ?? '') && taken.length > 0);
      while (at < lines.length && goesOn(at)) taken.push(lines[at++] ?? '');
      at--;
      blocks.push(markdownList(taken));
    } else if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flush();
      blocks.push({ type: 'horizontalRule' });
    } else if (paragraph.length === 0 && (lines[at + 1] ?? '').trim() === '' && (IMAGE_LINE.test(line) ? imageLine(line) : lineOnItsOwn(line))) {
      blocks.push((IMAGE_LINE.test(line) ? imageLine(line) : lineOnItsOwn(line)) as RichTextBlock);
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
  const start = ordered ? Number.parseInt(first?.[2] ?? '1', 10) : 1;
  const items: { text: string; inner: string[] }[] = [];
  for (const line of lines) {
    const item = LIST_ITEM.exec(line);
    if (item && (item[1]?.length ?? 0) <= indent) items.push({ text: item[3] ?? '', inner: [] });
    else items.at(-1)?.inner.push(line.slice(Math.min(indent + 2, line.length - line.trimStart().length)));
  }
  return {
    type: ordered ? 'orderedList' : 'bulletList',
    ...(ordered && start !== 1 && { attrs: { start } }),
    content: items.map(({ text, inner }) => ({ type: 'listItem' as const, content: [{ type: 'paragraph' as const, content: markdownInline(text) }, ...markdownBlocks(inner)] })),
  };
}

/**
 * Markdown, as an agent, an import or a person writes it, turned into formatted text: paragraphs,
 * headings (`#` to `####`, `#` kept at level 2), quotes, lists (nested by indenting), code in
 * backticks and in fences, bold, italics, strikethrough, `<u>`, `<sup>`, `<sub>`, links, pipe
 * tables, dividers, callouts (`> [!TIP]`), `<details>`, a picture of the site's library alone on
 * its line, and the rest described above. Anything else is kept as its words; a picture from
 * elsewhere is left out. A link that is not safe keeps its words and loses the link.
 */
export function richTextFromMarkdown(markdown: string): RichText {
  let fenced = false;
  // `<details><summary>…</summary>` on one line, as it is often written, is the two lines it stands for.
  const lines = markdown
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .flatMap((line) => {
      if (/^\s*(?:```|~~~)/.test(line)) fenced = !fenced;
      const both = fenced ? null : /^(\s*<details>)\s*(<summary>.*<\/summary>)\s*$/i.exec(line);
      return both ? [both[1] ?? '', both[2] ?? ''] : [line];
    });
  return { type: 'doc', content: markdownBlocks(lines) };
}

const MARK_ORDER = { link: 0, colour: 1, highlight: 2, bold: 3, italic: 4, strike: 5, underline: 6, superscript: 7, subscript: 8, code: 9 } as const satisfies Record<RichTextMark['type'], number>;
/** Words as markdown takes them for words: whatever would be read as a mark gets a backslash. */
const markdownWords = (text: string) => text.replace(/[\\`*_[\]{}~<]/g, '\\$&');
/** The start of a line that would be read as a heading, a quote, a list item or a table, guarded. */
const markdownLineStart = (line: string) => line.replace(/^(\s*)([#>+|-])/, '$1\\$2').replace(/^(\s*\d+)([.)]\s)/, '$1\\$2');

function inlineMarkdown(nodes: readonly RichTextInline[] | undefined, inCell = false): string {
  const text = (nodes ?? [])
    .map((node) => {
      if (node.type === 'hardBreak') return inCell ? '<br>' : '\n';
      const marks = [...(node.marks ?? [])].sort((a, b) => MARK_ORDER[b.type] - MARK_ORDER[a.type]);
      const words = marks.some((applied) => applied.type === 'code') ? node.text : markdownWords(node.text);
      // Code is the innermost and holds its words as they are; a link is the outermost.
      return marks.reduce((inside, applied) => {
        switch (applied.type) {
          case 'code':
            return `\`${node.text}\``;
          case 'bold':
            return `**${inside}**`;
          case 'italic':
            return `_${inside}_`;
          case 'strike':
            return `~~${inside}~~`;
          case 'underline':
            return `<u>${inside}</u>`;
          case 'superscript':
            return `<sup>${inside}</sup>`;
          case 'subscript':
            return `<sub>${inside}</sub>`;
          case 'colour':
            return `[${inside}]{colour=${applied.attrs.name}}`;
          case 'highlight':
            return `[${inside}]{highlight=${applied.attrs.name}}`;
          case 'link': {
            if (applied.attrs.href !== undefined && !isSafeLink(applied.attrs.href)) return inside;
            const href = hrefWritten(applied.attrs);
            return `[${inside}](${/[\s()<>]/.test(href) ? `<${href}>` : href})${writeAttrs({ target: applied.attrs.target, rel: applied.attrs.rel })}`;
          }
        }
      }, words);
    })
    .join('');
  if (inCell) return text.replace(/\|/g, '\\|');
  return text.split('\n').map(markdownLineStart).join('\n');
}

const withAlign = (line: string, align: RichTextAlign | undefined) => (align ? `${line} {align=${align}}` : line);
const quoted = (text: string) =>
  text
    .split('\n')
    .map((line) => (line === '' ? '>' : `> ${line}`))
    .join('\n');

function blockMarkdown(node: RichTextBlock): string {
  switch (node.type) {
    case 'paragraph': {
      let words = inlineMarkdown(node.content);
      // Words that are only the address of a video would be read back as the video: a guarded dot keeps them words.
      if (/^https?:\/\/\S+$/.test(words) && embedFromUrl(words)) words = words.replace('.', '\\.');
      return words === '' ? '' : withAlign(words, node.attrs?.align);
    }
    case 'heading':
      return withAlign(`${'#'.repeat(node.attrs.level)} ${inlineMarkdown(node.content).replace(/\n/g, ' ')}`, node.attrs.align);
    case 'blockquote':
      return quoted(blocksMarkdown(node.content));
    case 'codeBlock': {
      const code = (node.content ?? []).map((part) => part.text).join('');
      const fence = '`'.repeat(Math.max(3, ...[...code.matchAll(/`{3,}/g)].map((run) => run[0].length + 1)));
      return `${fence}${node.attrs?.language ?? ''}\n${code}\n${fence}`;
    }
    case 'horizontalRule':
      return '---';
    case 'image': {
      const { image, alt, caption, href, size } = node.attrs;
      const target = /[\s()<>]/.test(image) ? `<${image}>` : image;
      const picture = `![${markdownWords(alt)}](${target}${caption ? ` "${caption.replace(/["\\]/g, '\\$&')}"` : ''})`;
      return `${href ? `[${picture}](${href})` : picture}${writeAttrs({ size })}`;
    }
    case 'table': {
      const rows = node.content.map((row) => row.content.map((cell) => cell.content.map((paragraph) => inlineMarkdown(paragraph.content, true)).join('<br><br>')));
      const width = Math.max(...rows.map((row) => row.length));
      const line = (cells: readonly string[]) => `| ${Array.from({ length: width }, (_, index) => cells[index] ?? '').join(' | ')} |`;
      const headless = !(node.content[0]?.content.every((cell) => cell.type === 'tableHeader') ?? false);
      const [head = [], ...rest] = rows;
      const attrs = writeAttrs({ header: headless ? 'none' : undefined, style: node.attrs?.style });
      return [line(head), `| ${Array.from({ length: width }, () => '---').join(' | ')} |`, ...rest.map(line), ...(attrs ? [attrs] : [])].join('\n');
    }
    case 'callout':
      return quoted(`[!${node.attrs.tone.toUpperCase()}]\n${blocksMarkdown(node.content)}`);
    case 'details': {
      const [summary, content] = node.content;
      return `<details>\n<summary>${inlineMarkdown(summary.content).replace(/\n/g, ' ')}</summary>\n\n${blocksMarkdown(content.content)}\n\n</details>`;
    }
    case 'embed':
      return `[${markdownWords(node.attrs.title)}](${embedAddress(node.attrs)}){embed}`;
    case 'button': {
      const href = hrefWritten(node.attrs);
      return `[${markdownWords(node.attrs.label)}](${href}){${node.attrs.style ? `button=${node.attrs.style}` : 'button'}}`;
    }
    case 'bulletList':
    case 'orderedList': {
      const start = node.type === 'orderedList' ? (node.attrs?.start ?? 1) : 1;
      return node.content
        .map((item, index) => {
          const [first, ...rest] = item.content;
          const lead = first?.type === 'paragraph' ? inlineMarkdown(first.content).replace(/\n/g, ' ') : '';
          const inner = (first?.type === 'paragraph' ? rest : item.content).map(blockMarkdown).filter((block) => block !== '');
          const under = inner.flatMap((block) => block.split('\n')).map((line) => `  ${line}`);
          return [`${node.type === 'orderedList' ? `${start + index}.` : '-'} ${lead}`, ...under].join('\n');
        })
        .join('\n');
    }
  }
}

const blocksMarkdown = (blocks: readonly RichTextBlock[]) =>
  blocks
    .map(blockMarkdown)
    .filter((block) => block !== '')
    .join('\n\n');

/**
 * Formatted text as markdown: what `richTextFromMarkdown` reads back as the same text. This is
 * how an agent, a command or an export is handed formatted text, so that what it reads is what
 * it would write. Cells joined across columns or rows are written once each, unjoined.
 */
export function richTextToMarkdown(text: RichText): string {
  return blocksMarkdown(text.content);
}
