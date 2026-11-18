# RichTextEditor

Text with headings, lists, quotes, bold, italics and links.

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
- The value is a tree (`{ type: 'doc', content: [...] }`), never HTML. `onChange` gets `null` once nothing is left to read, so "required" means what it says.
- The text box is the one place in this package where ARIA is written by hand: React Aria has no rich text field, so the box names itself by its label, help and error as the other fields do.

## Example

```tsx
<RichTextEditor label="Description" value={text} onChange={setText} words={words} />
```
