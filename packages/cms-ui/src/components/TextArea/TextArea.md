# TextArea

Several lines of plain text, with its label, help and error. It lines up with `TextField`.

## Use it for

- A summary, a description for search engines, a note: plain text that can run to a few sentences.

## Don't use it for

- One line: use `TextField`.
- Text with headings, links or bold. That is the rich text editor.

## Example

```tsx
<TextArea
  label="Summary"
  description="Shown in search results. Aim for one or two sentences."
  value={summary}
  onChange={setSummary}
/>
```

## In a list

Inside a `Repeater`, pass `isLabelHidden`: the list's label is in view above the rows, and each row's own label is still read out. Nowhere else.
