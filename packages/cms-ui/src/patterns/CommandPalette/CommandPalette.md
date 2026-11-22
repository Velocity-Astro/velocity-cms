# CommandPalette

A window to find anything by typing and go there. A box at the top, and under it what matches, in groups such as "Go to" and
"Create". The arrow keys move through the matches, Enter chooses one and Escape closes the window. It opens near the top of the
window, where the eye already is.

## Use it for

- The one search of the editor, opened from the bar of `AppShell` and by its shortcut.

## Don't use it for

- Narrowing down one list on a screen: use `SearchField`.
- Choosing a value for a field: use `Select` or `OptionPicker`.

## Accessibility

The box has the focus when the window opens, and the matches are a menu it controls, so a screen reader hears each one as the
arrow keys reach it. A match is found by its words, its detail and any `keywords`. When nothing matches, the window says so.

## Things found elsewhere

The window narrows only what it is given. To search the site's content or its contacts as well, listen to `onSearch`, look
for what was typed, and hand the results over as a group marked `isFound`: its items are shown as they are, since what found
them may have looked at words the row does not show (an entry found by its address, a contact by their phone). Say that a
search is under way through `emptyText` while nothing has come back yet.
The shortcut that opens it is the app's to listen for, not this part's.

## Example

```tsx
<CommandPalette
  isOpen={isOpen}
  onOpenChange={setOpen}
  label="Search and commands"
  placeholder="Search, jump to or create anything"
  emptyText="Nothing matches that."
  groups={[
    { id: 'go', label: 'Go to', items: [{ id: 'listings', label: 'Listings', detail: 'Content', icon: FileText }] },
    { id: 'create', label: 'Create', items: [{ id: 'new-listing', label: 'New listing', icon: Plus }] },
  ]}
  onAction={run}
/>
```
