# Card

A framed part of a screen with its own heading.

## Use it for

- One section of a long form: "Price and status", "Photos".
- A block of a dashboard that stands on its own.

- One of several things of a kind, each with a state and a few actions: a plugin, an integration. The state and a switch go in `actions`, the buttons in `footer`.

## Don't use it for

- A few fields that make one value, such as an address. Use `Fieldset`.
- A single figure. Use `Stat`.
- Rows of data. `Table` has its own frame.
- A card inside a card.

## Example

```tsx
<Card title="Price and status" description="What buyers see first.">
  <NumberField label="Price" />
  <Select label="Status" options={statuses} />
</Card>
```

## Flush

`isFlush` runs what the card holds to its edges, for a `Table` with `frame="none"` or a list of rows that has its own spacing.
