# Dialog

A window over the page that must be dealt with before going back to it. Focus moves into it, stays
inside it, and returns to where it was when it closes. The page behind cannot be scrolled or
reached.

## Use it for

- A short task that belongs to the page behind it: rename, add a field, choose an image.
- A question that needs an answer before going on. For "are you sure?", use the `ConfirmDialog`
  pattern, which is built on this.

## Don't use it for

- A whole form or a long task: that is a page.
- A message that needs no answer: that is a toast.
- A dialog opened from a dialog.

## Side panel

`placement="side"` draws the dialog down the right edge at full height, for a task with a few
more fields that still belongs to the page behind it: an image's details, a field's settings.
It behaves the same way in every other respect.

## Closing

Escape, a press outside, and the close button (when `closeLabel` is given) all call
`onOpenChange(false)`. With `role="alertdialog"` a press outside does nothing, so the question is
answered on purpose.

## Example

```tsx
<Dialog
  isOpen={isOpen}
  onOpenChange={setOpen}
  title="Rename listing"
  closeLabel="Close"
  footer={
    <>
      <Button variant="secondary" onPress={() => setOpen(false)}>Cancel</Button>
      <Button onPress={rename}>Rename</Button>
    </>
  }
>
  <TextField label="Title" value={title} onChange={setTitle} />
</Dialog>
```

## Motion

A dialog in the middle grows into place; a panel at the side slides in from the edge. Both leave
the same way, faster. To see it leave, close it with `isOpen` and take it away in `onClosed`,
which is called once it has gone. A dialog that is unmounted while open simply disappears.
