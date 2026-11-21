# Table

Rows of the same kind of thing, with a heading for each column. The first column names each row
for screen readers, so put the title there.

## Use it for

- Lists of entries, people, redirects: anything a person scans and compares.

## Don't use it for

- Layout. Use `Grid`, `Stack` and `Inline`.
- A list with one piece of information per item.
- Rows that hold more than a line or two each. That is a list of cards.

## Sorting

Give a column `isSortable`, and pass `sort` and `onSortChange`. The table shows the arrow and
tells screen readers; the screen sorts the rows, because the data usually comes from the server
a page at a time.

## On a phone

A table wider than the window scrolls inside its frame, but a phone should rarely need it. Mark
the columns a person can do without at a glance `isSecondary` (when it was changed, where it
came from): below `md` they are left out, so the title and the state have the width. The first
column is never left out.

## Inside a card

`frame="none"` leaves out the table's own border, for a table inside a `Card` with `isFlush`, which frames it already.

## Keyboard

Tab moves into the table, arrows move between rows and cells, and Enter opens the row when
`onRowAction` is given.

## Example

```tsx
<Table
  label="Listings"
  columns={[
    { id: 'title', label: 'Title', isSortable: true },
    { id: 'status', label: 'Status' },
    { id: 'price', label: 'Price', align: 'end' },
  ]}
  rows={listings.map((listing) => ({
    id: listing.id,
    cells: { title: listing.title, status: <Tag>{listing.status}</Tag>, price: listing.price },
  }))}
  onRowAction={open}
  empty="No listings yet."
/>
```
