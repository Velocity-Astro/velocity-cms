# Toast

A short message that confirms something happened, shown in the corner without taking focus.
Put one `<Toast />` in the app; call `toast()` from anywhere to show a message.

## Use it for

- Confirming an action that has no other visible result: "Listing published", "Link copied".
- Something that went wrong in the background. Use `tone="danger"`: it stays until dismissed.

## Don't use it for

- An error in a form. Show it on the field, where it can be fixed.
- Anything a person must read or answer before going on. That is a `Dialog`.
- Something already visible on the page. If the row turned to "Published", that is enough.

## Behaviour

Messages are announced by screen readers without moving focus. They leave after six seconds,
pause while hovered or focused, and can be reached with F6. At most four show at once.

## Example

```tsx
// Once, in the app shell
<Toast label="Notifications" closeLabel="Dismiss" />

// Anywhere
toast({ title: 'Listing published', tone: 'success' });
toast({ title: 'Could not save', description: 'Check your connection and try again.', tone: 'danger' });
```
