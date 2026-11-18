# Split

A wide column with a narrow one beside it.

## Use it for

- An editing screen: the content in the wide column, and what goes with it (status, address, order) in the narrow one.

## Don't use it for

- Two columns of equal weight. Use `Grid`.
- Navigation. That is `AppShell`'s sidebar.
- More than two columns.

## Behaviour

- From the `xl` width up, the narrow column sits to the right and stays in view while the wide one scrolls.
- Below that, the narrow column follows the wide one, so nothing is squeezed.
- The narrow column is a landmark, named by `asideLabel`.

## Example

```tsx
<Split asideLabel="Publishing" aside={<Card title="On the site">…</Card>}>
  <Card title="Overview">…</Card>
  <Card title="Price">…</Card>
</Split>
```
