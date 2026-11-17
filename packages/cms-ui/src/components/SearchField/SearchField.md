# SearchField

A box for narrowing down a list by typing. A magnifying glass stands for its label on screen;
the label itself is read out by screen readers.

## Use it for

- Filtering the list on the same screen as you type.

## Don't use it for

- A value that is saved: use `TextField`, whose label is always visible.
- Search that needs a button and a results page of its own.

## Accessibility

Escape empties the field, and so does its button, which appears once something is typed.

## Example

```tsx
<SearchField label="Search listings" placeholder="Search by title" clearLabel="Clear search" value={query} onChange={setQuery} />
```
