# Text

Body text in one of the editor's sizes, tones and weights. Screens have no styling of their own,
so this is the only way to put words on a screen that are not a heading, a label or a button.

## Use it for

- Paragraphs, descriptions and help text.
- A value in a list or a table cell.
- Secondary information (`tone="muted"`).

## Don't use it for

- Titles: use `Heading`, so the page has an outline.
- A field's label or error: `TextField` has its own.
- Status such as Draft or Published: use `Tag`.
- Colour as the only signal. `tone="danger"` text must also say what is wrong.

## Example

```tsx
<Text tone="muted" size="sm">Last edited 2 hours ago</Text>
```
