import { EditorContent, useEditor, useEditorState, type Editor, type JSONContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, TextQuote, type LucideIcon } from 'lucide-react';
import { Fragment, useEffect, useId, useRef, useState } from 'react';
import { Dialog, DialogTrigger, Group, Popover, Separator, ToggleButton, Toolbar } from 'react-aria-components';
import { Button } from '../Button/index.js';
import { TextField } from '../TextField/index.js';
import { Tooltip } from '../Tooltip/index.js';
import {
  richTextEditorBoxVariants,
  richTextEditorClass,
  richTextEditorContentClass,
  richTextEditorDescriptionClass,
  richTextEditorErrorClass,
  richTextEditorLabelVariants,
  richTextEditorLinkActionsClass,
  richTextEditorLinkDialogClass,
  richTextEditorLinkOuterClass,
  richTextEditorLinkPanelClass,
  richTextEditorRequiredMarkClass,
  richTextEditorSeparatorClass,
  richTextEditorToolClass,
  richTextEditorToolIconSize,
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
  readonly heading: string;
  readonly subheading: string;
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
}

/** What the text may hold beyond paragraphs: each is a button of the toolbar, and what typing or pasting can make. */
export type RichTextFormat = 'bold' | 'italic' | 'link' | 'headings' | 'lists' | 'quotes';

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
}

const EVERY_FORMAT: readonly RichTextFormat[] = ['bold', 'italic', 'link', 'headings', 'lists', 'quotes'];

const EMPTY: RichTextDocument = { type: 'doc', content: [{ type: 'paragraph' }] };
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

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

interface Node {
  readonly type?: string;
  readonly content?: readonly Node[];
  readonly marks?: readonly { readonly type?: string }[];
}

const NODE_FORMAT: Readonly<Record<string, RichTextFormat>> = { heading: 'headings', bulletList: 'lists', orderedList: 'lists', listItem: 'lists', blockquote: 'quotes' };
const MARK_FORMAT: Readonly<Record<string, RichTextFormat>> = { bold: 'bold', italic: 'italic', link: 'link' };

/**
 * The text with only what the editor is built for. The editor drops a whole block it has no part
 * for, words and all, so a heading becomes a paragraph, a list or a quote gives what it holds,
 * and a mark it leaves out comes off its words before the text reaches it.
 */
function fitTo(text: RichTextDocument, allows: (format: RichTextFormat) => boolean): RichTextDocument {
  const fit = (nodes: readonly Node[]): Node[] =>
    nodes.flatMap((node): Node[] => {
      if (node.type === 'text') {
        const marks = node.marks?.filter((applied) => {
          const format = applied.type === undefined ? undefined : MARK_FORMAT[applied.type];
          return format === undefined || allows(format);
        });
        const { marks: _all, ...words } = node;
        return [marks && marks.length > 0 ? { ...words, marks } : words];
      }
      const format = node.type === undefined ? undefined : NODE_FORMAT[node.type];
      const content = node.content && fit(node.content);
      if (format === undefined || allows(format)) return [{ ...node, ...(content && { content }) }];
      if (node.type === 'heading') return [{ type: 'paragraph', ...(content && { content }) }];
      return content ?? [];
    });
  return { ...text, content: fit((text.content ?? []) as readonly Node[]) };
}

interface Tool {
  readonly name: string;
  readonly format: RichTextFormat;
  readonly icon: LucideIcon;
  readonly isActive: (editor: Editor) => boolean;
  readonly run: (editor: Editor) => void;
}

/** Text with headings, lists, quotes, bold, italics and links, with its label, help and error. */
export function RichTextEditor({ label, isLabelHidden = false, description, errorMessage, isRequired = false, value, onChange, words, formats = EVERY_FORMAT }: RichTextEditorProps) {
  const allows = (format: RichTextFormat) => formats.includes(format);
  // The formats decide which parts the editor is built from, so another set builds it anew.
  const formatsKey = EVERY_FORMAT.filter(allows).join(' ');
  const labelId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const described = [description !== undefined && descriptionId, errorMessage !== undefined && errorId].filter(Boolean).join(' ');
  // What the editor last said, so a value that only echoes it does not move the cursor.
  const said = useRef<RichTextDocument | null>(value);
  const changed = useRef(onChange);
  changed.current = onChange;

  const editor = useEditor({
    extensions: [
      // A format left out is left out of the editor altogether, so nothing pasted or typed makes it.
      StarterKit.configure({
        heading: allows('headings') && { levels: [2, 3] },
        link: allows('link') && { openOnClick: false, autolink: true, defaultProtocol: 'https' },
        bold: allows('bold') && {},
        italic: allows('italic') && {},
        bulletList: allows('lists') && {},
        orderedList: allows('lists') && {},
        listItem: allows('lists') && {},
        listKeymap: allows('lists') && {},
        blockquote: allows('quotes') && {},
        code: false,
        codeBlock: false,
        strike: false,
        underline: false,
        horizontalRule: false,
      }),
    ],
    content: fitTo(value ?? EMPTY, allows) as JSONContent,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-labelledby': labelId,
        class: richTextEditorContentClass,
      },
    },
    onUpdate: ({ editor: current }) => {
      const next = current.isEmpty ? null : withoutEmptyEnd(current.getJSON() as RichTextDocument);
      said.current = next;
      changed.current(next);
    },
  }, [formatsKey]);

  // The attributes that change with the props.
  useEffect(() => {
    editor.setOptions({
      editorProps: {
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
    editor.commands.setContent(fitTo(value ?? EMPTY, allows) as JSONContent, { emitUpdate: false });
  }, [editor, value]);

  const marks: Tool[] = ([
    { name: words.bold, format: 'bold', icon: Bold, isActive: (e) => e.isActive('bold'), run: (e) => e.chain().focus().toggleBold().run() },
    { name: words.italic, format: 'italic', icon: Italic, isActive: (e) => e.isActive('italic'), run: (e) => e.chain().focus().toggleItalic().run() },
  ] satisfies Tool[]).filter((tool) => allows(tool.format));
  const blocks: Tool[] = ([
    { name: words.heading, format: 'headings', icon: Heading2, isActive: (e) => e.isActive('heading', { level: 2 }), run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
    { name: words.subheading, format: 'headings', icon: Heading3, isActive: (e) => e.isActive('heading', { level: 3 }), run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
    { name: words.bulletList, format: 'lists', icon: List, isActive: (e) => e.isActive('bulletList'), run: (e) => e.chain().focus().toggleBulletList().run() },
    { name: words.numberedList, format: 'lists', icon: ListOrdered, isActive: (e) => e.isActive('orderedList'), run: (e) => e.chain().focus().toggleOrderedList().run() },
    { name: words.quote, format: 'quotes', icon: TextQuote, isActive: (e) => e.isActive('blockquote'), run: (e) => e.chain().focus().toggleBlockquote().run() },
  ] satisfies Tool[]).filter((tool) => allows(tool.format));
  // Which tools are on changes with the cursor, not with the props.
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      tools: [...marks, ...blocks].map((tool) => tool.isActive(current)),
      link: current.isActive('link'),
      href: (current.getAttributes('link')['href'] as string | undefined) ?? '',
    }),
  });
  const group = (tools: readonly Tool[], offset: number, name: string) => (
    <Group aria-label={name}>
      {tools.map((tool, index) => (
        <Tooltip key={tool.name} content={tool.name}>
          <ToggleButton aria-label={tool.name} isSelected={active.tools[offset + index] ?? false} onChange={() => tool.run(editor)} className={richTextEditorToolClass}>
            <tool.icon aria-hidden size={richTextEditorToolIconSize} />
          </ToggleButton>
        </Tooltip>
      ))}
    </Group>
  );

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
      <div className={richTextEditorBoxVariants({ isInvalid: errorMessage !== undefined })}>
        {(marks.length > 0 || blocks.length > 0 || allows('link')) && (
          <Toolbar aria-label={words.toolbar} className={richTextEditorToolbarClass}>
            {/* A line between the groups that are there, and none at either end. */}
            {[
              marks.length > 0 && group(marks, 0, words.toolbar),
              blocks.length > 0 && group(blocks, marks.length, words.toolbar),
              allows('link') && <LinkTool editor={editor} isActive={active.link} href={active.href} words={words} />,
            ]
              .filter(Boolean)
              .map((part, index) => (
                <Fragment key={index}>
                  {index > 0 && <Separator orientation="vertical" className={richTextEditorSeparatorClass} />}
                  {part}
                </Fragment>
              ))}
          </Toolbar>
        )}
        <EditorContent editor={editor} />
      </div>
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

interface LinkToolProps {
  readonly editor: Editor;
  readonly isActive: boolean;
  readonly href: string;
  readonly words: RichTextEditorWords;
}

/** The link button, with the small panel its address is typed in. */
function LinkTool({ editor, isActive, href, words }: LinkToolProps) {
  const [isOpen, setOpen] = useState(false);
  const [address, setAddress] = useState('');
  const open = (next: boolean) => {
    if (next) setAddress(href);
    setOpen(next);
  };
  const apply = () => {
    const link = editor.chain().focus().extendMarkRange('link');
    if (address.trim() === '') link.unsetLink().run();
    else link.setLink({ href: address.trim() }).run();
    setOpen(false);
  };
  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={open}>
      <Tooltip content={words.link}>
        <ToggleButton aria-label={words.link} isSelected={isActive} onChange={() => open(true)} className={richTextEditorToolClass}>
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
          <TextField label={words.linkAddress} description={words.linkHelp} value={address} onChange={setAddress} autoFocus />
          <div className={richTextEditorLinkActionsClass}>
            {isActive && (
              <Button
                variant="ghost"
                size="sm"
                onPress={() => {
                  editor.chain().focus().extendMarkRange('link').unsetLink().run();
                  setOpen(false);
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
