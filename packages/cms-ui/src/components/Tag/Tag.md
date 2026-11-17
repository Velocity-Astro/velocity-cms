# Tag

A short label for a state or a category: Draft, Published, For sale.

## Use it for

- The status of an entry in a list or a header.
- A category or a type beside a title.

## Don't use it for

- Anything a person can click. A Tag is never interactive: use `Button`.
- A count or a notification dot.
- A message. If it needs a sentence, use `Text`.
- Colour as the only signal. The words say the state; the tone only supports them.

## Example

```tsx
<Tag tone="success">Published</Tag>
<Tag tone="warning">Unpublished changes</Tag>
```
