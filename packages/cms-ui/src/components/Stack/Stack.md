# Stack

Children in a column, with the same gap between each.

## Use it for

- The fields of a form.
- The sections of a screen or a panel.
- Any time one thing sits under another.

## Don't use it for

- A row: use `Inline`.
- Space around something: use `Box` with `padding`.
- Space between two things by adding an empty element. Put both in a Stack and set `gap`.

## Filling the screen

`fill` makes the column at least as tall as the space it is in. Give the part that should take
the spare room a `Box` with `grow`, and what comes after it sits at the bottom: this is how a
screen keeps its `SaveBar` at the foot of a short form.

## Example

```tsx
<Stack gap={6}>
  <Heading level={1}>Listings</Heading>
  <Text tone="muted">32 published</Text>
</Stack>
```
