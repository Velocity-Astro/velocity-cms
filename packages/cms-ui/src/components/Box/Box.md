# Box

A surface. It gives its content padding, a background, a border, a radius and a shadow, each
chosen from the tokens.

## Use it for

- A card, a panel or a well.
- Padding around a region of a screen.
- A landmark (`as="main"`, `as="aside"`) that needs spacing.

## Don't use it for

- Arranging children. Box does not lay anything out: use `Stack` for a column and `Inline` for a row.
- Clickable surfaces. A Box is never interactive: use `Button`.

## Example

```tsx
<Box surface="card" border radius="lg" padding={6}>
  <Stack gap={4}>…</Stack>
</Box>
```
