# Menu

A list of actions that opens from a button.

## Use it for

- The less common actions of a row or a page, behind a "More actions" `IconButton`: duplicate,
  unpublish, delete.
- A button that offers a few related actions.

## Don't use it for

- Choosing a value for a field: use `Select`.
- The one action most people come for. Put that on the screen as a `Button`.
- Navigation. Links belong in the page or the sidebar.

## Keyboard

Enter, Space or the down arrow opens the menu on its first action. Arrows move, typing jumps to a
match, Enter chooses, Escape closes and returns focus to the button.

## Example

```tsx
<Menu
  trigger={<IconButton label="More actions" icon={Ellipsis} />}
  actions={[
    { id: 'duplicate', label: 'Duplicate', icon: Copy },
    { id: 'delete', label: 'Delete', icon: Trash2, tone: 'danger' },
  ]}
  onAction={run}
/>
```
