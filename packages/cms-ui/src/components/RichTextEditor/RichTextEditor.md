# RichTextEditor

Formatted text: headings, lists, quotes, marks and links, and for long text the site's colours, pictures, tables, code, callouts, details, embeds, buttons and dividers.

## Use it for

- Long text a person shapes: a listing's description, a biography, an article.

## Don't use it for

- Plain text of several lines. Use `TextArea`.
- One line. Use `TextField`.

## Behaviour

- The toolbar is one stop in the tab order; the arrow keys move between its buttons.
- A button is lit while the cursor is in text it applies to. Pressing it again takes the format off.
- The usual shortcuts work in the text: Ctrl or Cmd with B and I, and typing `## `, `- ` or `1. ` at the start of a line.
- The link button opens a small panel for the address. Enter applies it; an empty address takes the link off. A web address typed into the text becomes a link by itself.
- `formats` keeps to what a spot of a design was drawn for, such as `['bold', 'italic', 'link']` for paragraphs set under a heading: the toolbar shows only those buttons (none at all for `[]`), and typing or pasting cannot make anything else. Left out, every format.
- The value is a tree (`{ type: 'doc', content: [...] }`), never HTML. `onChange` gets `null` once nothing is left to read, so "required" means what it says.
- The toolbar stays at the top of the window while a long text scrolls under it. Typing `/` at the start of an empty line opens a menu of blocks with a search; choosing words shows a small bar with the marks and the link over them. The keyboard button lists the shortcuts.
- Colours and highlights are only the site's (`looks`), kept by name and drawn by the site. With none, there is no colour button: nobody picks a colour of their own. Tables, buttons and callouts take their styles from `looks` too.
- A picture is one of the site's, chosen with `onPickImage` and kept by its name; a pasted or dropped file goes to `onUploadImage`. A picture pasted from another page is never kept (the site does not have it), and `onPasteDropped` is told how many were left out.
- A video, map or player is added from the address it is shared at, and kept as the service and its id (`embedFrom`): a lone video address pasted on an empty line becomes one.
- `renderLinkChooser` draws where a link or a button leads, so a link can be to an entry of the site rather than an address. A link can open in a new tab, and say nofollow or sponsored.
- The settings button opens what can be set on the picture, table, code block, callout, embed or button the cursor is on.
- A long text (one that allows pictures or tables) shows its words and the minutes it takes to read.
- The text box is the one place in this package where ARIA is written by hand: React Aria has no rich text field, so the box names itself by its label, help and error as the other fields do.

## Example

```tsx
<RichTextEditor label="Description" value={text} onChange={setText} words={words} />
<RichTextEditor label="Article" value={text} onChange={setText} words={words} looks={looks} onPickImage={pick} embedFrom={embedFrom} />
```
