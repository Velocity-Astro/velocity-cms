# Board

Columns of cards, where a card is moved from one column to another.

## Use it for

- A pipeline: contacts by the stage they are in, moved along as the work goes on.
- Anything a team sorts into a few named states and moves between them one at a time.

## Don't use it for

- A list to read or search. Use `Table`.
- Putting things in an order within one list. Use `SectionList` or `Repeater`.
- More than a dozen or so columns: a board is read at a glance.

## Behaviour

- A card is a button: pressing it, or Enter on it, opens what it stands for.
- A card is dragged to another column, which is outlined while the card is held over it. Dropping it on its own column does nothing.
- Each card has a menu that names every other column, so a card can be moved with a keyboard, a screen reader or a touch screen without dragging.
- A column says how many it holds, which can be more than the cards it shows; `more` says how many are not shown.
- A column with no cards shows `emptyText`, and still takes a card.
- A board wider than its place scrolls sideways by itself. The page never does.
- The board does not move a card itself: `onMove` is told, and the screen gives it the columns again.

## Example

```tsx
<Board
  label="Pipeline"
  columns={stages.map((stage) => ({ id: stage.id, title: stage.name, count: '3', items: cards(stage) }))}
  emptyText="Nobody here"
  onOpen={(id) => go(paths.contact(id))}
  onMove={(id, stage) => move(id, stage)}
  moveLabel={(name) => `Move ${name}`}
/>
```
