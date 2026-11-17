# Stat

One figure with what it counts: 3 drafts, 12 published.

## Use it for

- The handful of numbers at the top of a dashboard.
- A count a person checks at a glance before deciding where to go.

## Don't use it for

- A number inside a sentence. Use `Text`.
- A state. Use `Tag`.
- Anything a person can click. A Stat is never interactive: put a `Link` or a `Button` beside it.
- More than four in a row. Past that it is a `Table`.

## Example

```tsx
<Grid columns={3}>
  <Stat label="Published" value="12" />
  <Stat label="Drafts" value="3" detail="Not on the site yet" />
</Grid>
```
