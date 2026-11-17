# Heading

A title. `level` sets its place in the page outline, which is what screen reader users navigate
by. `size` changes only how big it looks, so the outline never has to bend to the design.

## Use it for

- The title of a screen (`level={1}`, once).
- The title of a section, a panel or a dialog.

## Don't use it for

- Making text bold or big: use `Text` with `weight` or `size`.
- A field's label: `TextField` has its own.
- Skipping levels to get a size. Set `size` instead.

## Example

```tsx
<Heading level={2} size="sm">Open houses</Heading>
```
