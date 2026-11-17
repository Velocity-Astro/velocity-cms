# Grid

Children in equal columns, with the same gap between each.

## Use it for

- Fields that belong side by side: city and postcode, price and currency.
- Cards of the same kind.

## Don't use it for

- A row of buttons or tags: use `Inline`, which sizes each child to its content.
- Rows of data with headings: use `Table`.
- One column. That is a `Stack`.

## Example

```tsx
<Grid columns={2} gap={4}>
  <TextField label="City" />
  <TextField label="Postcode" />
</Grid>
```
