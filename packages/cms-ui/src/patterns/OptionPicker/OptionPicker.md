# OptionPicker

A window to choose one thing from a set of named kinds, in groups: the kind of section to add to
a page. Each option has a name, a line on what it gives and an icon, or a picture of what it
gives. Choosing one closes the window.

## Use it for

- Choosing what kind of thing to add, when there are more kinds than a menu holds well, or each
  needs a line of explanation.

## Don't use it for

- A handful of actions on one thing. Use `Menu`.
- Choosing a value for a field. Use `Select`.
- Choosing a picture. Use `ImagePicker`.

## Writing it

- The title says what is being chosen: "Add a section".
- An option's description says what it puts on the page, in one line.
- `image` is a picture of what the option gives, as wide as it is on the page and cut to 16 by 9.
  Once any option has one, every option is a card and the window is wider; an option with none
  shows its icon in a frame of the same size. The picture is decoration: the words name the option.

## Behaviour

Focus starts in the list. Arrow keys move between options across groups, typing a name jumps to
it, and Enter or a press chooses. Escape, the close button or a press outside closes without
choosing. A group with no options is left out; with no options at all, `emptyText` is shown.

## Example

```tsx
<OptionPicker
  isOpen={isOpen}
  onOpenChange={setOpen}
  title="Add a section"
  closeLabel="Close"
  groups={[{ id: 'content', label: 'Content', options: [{ id: 'text', label: 'Text', description: 'Paragraphs and lists.', icon: Type }] }]}
  onChoose={add}
  emptyText="This page has no kinds of section yet."
/>
```
