# Thumbnail

A small picture beside the words that name it.

## Use it for

- A listing's photo or a person's portrait in a row of a `Table`.
- Anywhere a picture helps find a thing whose name is written next to it.

## Don't use it for

- A picture that says something the words do not. A Thumbnail is hidden from screen readers.
- Choosing an image. Use `ImagePicker`.
- An icon. Pass a Lucide icon to the part that takes one.

## Behaviour

- Without `src` it shows an empty frame of the same size, so rows stay lined up.
- The picture fills the frame and is cropped to it.
- It is never interactive.

## Example

```tsx
<Inline gap={3}>
  <Thumbnail src={photo.url} />
  <Text weight="semibold">6214 Lakeshore Drive</Text>
</Inline>
```
