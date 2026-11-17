# Select

One choice from a list, with its label, help and error. It lines up with `TextField`.

## Use it for

- Choosing one of roughly four to fifteen known options: a status, a property type, a language.

## Don't use it for

- Yes or no: use `Checkbox`.
- Hundreds of options, or options a person will search for: that is a combo box, with its own
  component.
- Starting an action. A list of things to do is a `Menu`.

## Keyboard

Enter, Space or the down arrow opens the list. Arrows move, typing jumps to a match, Enter
chooses, Escape closes and leaves the value as it was.

## Example

```tsx
<Select
  label="Status"
  options={[
    { id: 'for-sale', label: 'For sale' },
    { id: 'sold', label: 'Sold' },
  ]}
  value={status}
  onChange={setStatus}
/>
```
