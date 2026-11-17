# Repeater

A list a person builds: add an item, fill it in, put the items in order, take one out.

## Use it for

- A field that holds several of the same thing: photos, paragraphs, opening hours.
- Items that have fields of their own, such as a feature with a title and a list.

## Don't use it for

- Choosing from a fixed set. Use `Select` or `Checkbox`.
- Showing rows nobody edits. Use `Table`.
- Tags typed in one box.

## Behaviour

- Every item has three buttons: move up, move down, remove. Each is named with the item's place, so a screen reader hears "Remove photo 2".
- The first item cannot move up and the last cannot move down.
- With no items it shows `emptyText`, never an empty frame.

## Example

```tsx
<Repeater
  label="Photos"
  items={photos.map((photo, index) => ({ id: String(index), content: <TextField label={`Photo ${index + 1}`} value={photo} /> }))}
  emptyText="No photos yet"
  addLabel="Add photo"
  onAdd={add}
  onRemove={remove}
  onMove={move}
  removeLabel={(position) => `Remove photo ${position}`}
  moveUpLabel={(position) => `Move photo ${position} up`}
  moveDownLabel={(position) => `Move photo ${position} down`}
/>
```
