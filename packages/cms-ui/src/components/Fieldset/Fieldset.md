# Fieldset

Several fields that belong together, under one name. A screen reader says the name before each
field inside, so "City" is heard as "Address, City".

## Use it for

- A value made of parts: an address, a price with its currency, opening hours.
- Fields inside fields. A set can sit inside another set.

## Hidden legend

Inside a row that opens, the row's heading already says the name. `isLegendHidden` keeps the
legend for a screen reader and draws the set without its frame, so there is no box in a box.

## Don't use it for

- Splitting a long form into sections. Use a `Heading` over a `Stack`.
- One field. Its own label is enough.

## Example

```tsx
<Fieldset legend="Address">
  <TextField label="Street" />
  <TextField label="City" />
</Fieldset>
```
