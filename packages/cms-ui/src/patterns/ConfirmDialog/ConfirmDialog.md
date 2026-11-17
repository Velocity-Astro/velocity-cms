# ConfirmDialog

Asks before doing something that is hard to undo. Every destructive action in the editor goes
through it, so the question always looks the same and the buttons are always in the same place:
cancel first, the action last.

## Use it for

- Deleting, unpublishing, discarding changes, removing a person.

## Don't use it for

- Actions that are easy to undo. Do them, and offer undo in a toast.
- Routine saves. Asking every time teaches people to press Enter without reading.

## Writing it

- The title is the question and names the thing: "Delete 6214 Lakeshore Drive?"
- The body says what happens and whether it can be undone.
- The button repeats the verb: "Delete listing". Never "Yes" or "OK".

## Behaviour

Focus starts on Cancel, so Enter never destroys anything by accident. Escape cancels. A press
outside does nothing. While `isPending`, the dialog stays open and Cancel is disabled.

## Example

```tsx
<ConfirmDialog
  isOpen={isOpen}
  onOpenChange={setOpen}
  title="Delete 6214 Lakeshore Drive?"
  confirmLabel="Delete listing"
  cancelLabel="Cancel"
  tone="danger"
  onConfirm={remove}
  isPending={removing}
>
  The listing is removed from the site at once. You can restore it from the trash for 30 days.
</ConfirmDialog>
```
