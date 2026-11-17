# Segmented

A few choices in a row, one of them always chosen.

## Use it for

- A filter over a list: All, Published, Drafts.
- Switching between versions of the same thing, such as an entry's languages.

## Don't use it for

- More than about five choices, or long labels: use `Select`.
- Views with their own content under them: use `Tabs`.
- A setting that is on or off: use `Switch`.

## Example

```tsx
<Segmented label="Show" options={[{ id: 'all', label: 'All' }, { id: 'drafts', label: 'Drafts' }]} selected={filter} onChange={setFilter} />
```
