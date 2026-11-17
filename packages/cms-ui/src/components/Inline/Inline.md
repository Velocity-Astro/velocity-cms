# Inline

Children in a row, with the same gap between each.

## Use it for

- A group of buttons.
- A title with actions on the other side (`justify="between"`).
- An icon or a tag beside text.

## Don't use it for

- A column: use `Stack`.
- A grid of cards.
- Tabular data.

## Example

```tsx
<Inline justify="between">
  <Heading level={1}>Listings</Heading>
  <Button icon={Plus}>New listing</Button>
</Inline>
```
