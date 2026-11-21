# Outline

The parts of something long, by name and in order, such as the sections of a page in the visual editor. A part inside another is
set in under it. The one being looked at is marked, and choosing one goes to it.

## Use it for

- Finding your way around a page: beside it in the visual editor, where the page is too long to see whole.

## Don't use it for

- Changing anything. It is a way around: what is chosen is edited where it is, in the form. To put sections in order, use the
  form's own `SectionList` or the page's Reorder.
- Navigation between screens: use the links of `AppShell`.

## Accessibility

It is a list box named by its title. The arrow keys move through it, and Enter or a press chooses. Choosing the one already
chosen still goes to it, so a person can come back to it after scrolling away.

## Example

```tsx
<Outline
  title="Sections"
  emptyText="No sections yet."
  items={[
    { id: 's1', label: 'Page opening', icon: PanelTop },
    { id: 's2', label: 'Two columns', icon: Columns2 },
    { id: 's3', label: 'Text', depth: 1, icon: AlignLeft },
  ]}
  currentId="s2"
  onChoose={goTo}
/>
```
