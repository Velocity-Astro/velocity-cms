# Segmented

A few choices in a row, one of them always chosen.

## Use it for

- A filter over a list: All, Published, Drafts.
- Switching between versions of the same thing, such as an entry's languages.
- A choice among a few looks of the site's own, such as a section's background: give each option its `swatch`, a sample of the colour, and show the label with `isLabelShown`.

## Don't use it for

- More than about five choices, or long labels: use `Select`.
- Views with their own content under them: use `Tabs`.
- A setting that is on or off: use `Switch`.

## Behaviour

- An option's `swatch` is a sample only: a small circle of that colour before the label. The label still says what the choice is.
- `isLabelShown` puts the label above the choices, and `description` or `errorMessage` under them, so it sits in a form like any field.

## Example

```tsx
<Segmented label="Show" options={[{ id: 'all', label: 'All' }, { id: 'drafts', label: 'Drafts' }]} selected={filter} onChange={setFilter} />
```

## Icons

An option may have an `icon`. With `areLabelsHidden` each choice shows its icon alone, as a square: its words are still read out, and shown in a tooltip on hover and focus. Use it only where every choice has an icon people know, such as the widths of a page.
