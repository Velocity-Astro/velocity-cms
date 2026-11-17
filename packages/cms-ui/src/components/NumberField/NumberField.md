# NumberField

A number, with its label, help and error. People type it the way they write numbers, with their
own thousands and decimal marks, and it is tidied when they leave the field. The value is a
number, or `null` when the field is empty.

## Use it for

- Prices, sizes, counts, years: anything that is calculated with or compared.

## Don't use it for

- Numbers that are really names, such as a phone number, a postcode or a reference. Use
  `TextField`, so leading zeros and spaces are kept.

## Keyboard

The up and down arrows change the value by one. Values outside `minValue` and `maxValue` are
brought back inside when the person leaves the field.

## Example

```tsx
<NumberField label="Price" value={price} onChange={setPrice} minValue={0} isInteger />
```
