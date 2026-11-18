# MediaGrid

A library of pictures to look through, each with its name and a line about it. Arrow keys move
between the pictures; a press or Enter opens one.

## Use it for

- The media library: every image the site has, to open, inspect and remove.

## Don't use it for

- Choosing an image for a field: `ImagePicker`, which has the grid, the window and the upload.
- A picture beside a row's name in a list: `Thumbnail`.

## Example

```tsx
<MediaGrid
  label="Photos"
  items={[{ id: 'porch', name: 'porch', url: '/media/porch.jpg', note: '1600 × 900' }]}
  onAction={open}
  emptyText="No photos match."
/>
```
