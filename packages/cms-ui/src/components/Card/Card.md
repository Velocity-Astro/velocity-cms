# Card

A framed part of a screen with its own heading.

## Use it for

- One section of a long form: "Price and status", "Photos".
- A block of a dashboard that stands on its own.

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
