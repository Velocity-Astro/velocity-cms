# PagePreview

A page of the site as it would look with what is in a form now, in a frame. The site draws the
page itself, from what the form holds, so the frame shows exactly what visitors would get. Nothing
of the page is drawn by the editor.

## Use it for

- The page beside the form that builds it.

## Don't use it for

- A picture. Use `Thumbnail`.
- Opening the page to read it whole, or to send to someone. Use a link that opens a new tab.

## Behaviour

- `draft` is posted to `address` in a form field named `draft`, into the frame. The first page is
  asked for at once; after that, half a second after the last change.
- The form that posts it is put at the end of the page, so the preview can sit inside a form of the screen's own.
- `address` must be on this site. The frame listens only to this site's own page, and only in
  this frame.
- A page that says which of its sections was pressed has it passed to `onSectionPress`, with the
  field that was pressed where the page marks its fields. `shownSectionId` asks the page to
  outline a section and bring it into view, again each time the page is drawn.
- `typable` says where words may be typed on the page itself (for each section, its fields by key), and is told to the page each time it is drawn. What is typed there comes to `onWords` as it is typed. The page shows those words already, so the change of `draft` that follows them asks for no new page; a change made in the form still does.
- `width` tries the page at a phone's, a tablet's or the pane's own width.
- `isBare` leaves out its border, for a place that frames it already, such as a whole window.
- With no `address` there is no page yet, and `emptyText` says so.
- It fills the height it is given, so put it in something with a height, such as `Workbench`.

## Example

```tsx
<PagePreview
  label="Why list with us, as it would look"
  address={preview.path}
  draft={JSON.stringify({ id: entry.id, data })}
  width={width}
  toolbar={<Segmented label="Width" … />}
  emptyText="Save the page once to see it here."
  onSectionPress={open}
/>
```
