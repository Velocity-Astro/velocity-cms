# TextField

One line of text, with its label, its help and its error.

## Use it for

- A title, a name, an address line, an email, a URL.
- Any single-line value a person types.

## Don't use it for

- Several lines: that is a text area, with its own component.
- A choice from a known list: use a select.
- Numbers with units, dates or money: each gets its own field.
- A placeholder instead of a label. The label is required and always visible; the placeholder is
  only an example of a value.

## Errors

Set `errorMessage` and the field is marked invalid, outlined, and the message is read out with the
field. Say what is wrong and how to fix it: "Enter a price above 0", not "Invalid".

## Example

```tsx
<TextField
  label="Street"
  description="As it appears on the listing"
  value={street}
  onChange={setStreet}
  isRequired
  {...(error && { errorMessage: error })}
/>
```
