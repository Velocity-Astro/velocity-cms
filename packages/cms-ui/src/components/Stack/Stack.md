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

## Example

```tsx
<Stack gap={6}>
  <Heading level={1}>Listings</Heading>
  <Text tone="muted">32 published</Text>
</Stack>
```
