# DateField

A calendar date, with its label, help and error. The day, month and year are separate parts in
the order the person's language writes them, so 3/4 is never read the wrong way round. The value
is always `YYYY-MM-DD`, or `null` when empty.

## Use it for

- A date a person knows and can type: a listing date, a birthday, an event.

## Don't use it for

- A date and a time, or a range of dates. Each gets its own component.
- Choosing "next Thursday" by looking at a calendar. That is a date picker, which adds a calendar
  to this field.

## Keyboard

Each part is typed or changed with the up and down arrows. The left and right arrows move between
parts, and Backspace clears one.

## Example

```tsx
<DateField label="Listed on" value={listedOn} onChange={setListedOn} />
```
