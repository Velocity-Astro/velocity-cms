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
