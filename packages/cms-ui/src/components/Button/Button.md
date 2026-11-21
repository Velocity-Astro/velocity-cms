# Button

Starts an action: save, publish, add, delete.

## Variants

- `primary`: the one main action of a screen or a dialog. One per view.
- `secondary`: every other action.
- `ghost`: low-emphasis actions that repeat, such as in a toolbar or a row.
- `danger`: an action that destroys something. Always behind a confirmation.

## Use it for

- Anything that does something when pressed.
- Submitting a form (`type="submit"`).

## Don't use it for

- Going to another page. That is a link, and gets its own component.
- Two primary buttons side by side. Decide which one is the main action.
- A disabled button with no explanation. Prefer leaving it enabled and saying what is missing.

## States

`isPending` shows a spinner and ignores presses while keeping focus, so a person using a keyboard
is not thrown back to the top of the page. Disabled buttons are dimmed and skipped by focus.

## Example

```tsx
<Button icon={Plus} onPress={createListing}>New listing</Button>
<Button variant="secondary">Save draft</Button>
<Button variant="danger" isPending={deleting}>Delete</Button>
```

## Brand

`variant="brand"` is the brand's orange with dark ink. It is a screen's one orange, for the one step a whole view leads to, such as Publish in the visual editor. Everywhere else the main action is `primary`.
