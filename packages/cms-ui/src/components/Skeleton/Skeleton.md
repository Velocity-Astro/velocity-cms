# Skeleton

A grey shape standing where something will be once it has loaded, so the screen keeps its layout
and nothing jumps when the content arrives. It waits a moment before it shows, so content that
arrives at once never flashes grey first.

## Use it for

- A screen or a part of one whose content is being fetched: lay shapes out like the content,
  with the same `Stack`, `Inline`, `Grid` and `Card` the content uses.
- Wrap the shapes of one thing in `SkeletonGroup`, which says what is loading to screen readers.

## Don't use it for

- A button whose action is under way: `Button` has `isPending`.
- Something with no shape to keep, such as a whole page before anyone is signed in: `Spinner`.

## Example

```tsx
<SkeletonGroup label="Loading listings">
  <Stack gap={3}>
    <Skeleton shape="title" width="1/3" />
    <Skeleton />
    <Skeleton width="3/4" />
  </Stack>
</SkeletonGroup>
```
