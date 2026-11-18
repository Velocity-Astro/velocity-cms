# SectionList

Sections of different kinds in an order a person chooses. Each opens to show its own fields.

## Use it for

- The sections of a page: a hero, then a feature grid, then questions.
- Any list whose items are of different kinds and too large to edit all at once.

## Don't use it for

- Several of the same small thing, such as photos or opening hours. Use `Repeater`.
- Showing rows nobody edits. Use `Table`.
- Switching between views of one thing. Use `Tabs`.

## Behaviour

- A section's heading is a button that opens and closes it. Closed, it shows the section's kind, a few of its words and, when something is wrong inside, what.
- Each section has move up, move down and a menu of the actions it is given. The first cannot move up and the last cannot move down.
- A section with a `tag`, such as "Hidden", is shown quieter, so it reads as not on the page.
- A section is dragged by its heading or the handle at its start, and a line shows where it would land. With the keyboard, Enter on the handle picks it up, Tab goes to another section, and Enter puts it down in that section's place; Escape puts it back. The up and down buttons do the same one step at a time.
- With no sections it shows `emptyText`, never an empty frame.
- `revealId` brings a section into view when it was chosen somewhere else, such as on the page beside the form.

## Example

```tsx
<SectionList
  label="Sections"
  items={sections.map((section) => ({ id: section.id, title: 'Call to action', summary: section.title, icon: Megaphone, content: <Fields />, actions }))}
  openIds={open}
  onOpenChange={toggle}
  emptyText="No sections yet"
  addLabel="Add section"
  onAdd={pick}
  onMove={move}
  onAction={act}
  moveUpLabel={(position) => `Move section ${position} up`}
  moveDownLabel={(position) => `Move section ${position} down`}
  moreLabel={(position) => `More for section ${position}`}
/>
```
