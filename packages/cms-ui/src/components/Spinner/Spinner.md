# Spinner

Says that something is on its way. Its label is always read out by screen readers, and can be
shown beside it.

## Use it for

- A part of the screen whose content is being fetched and will take a moment.

## Don't use it for

- A button whose action is under way: `Button` has `isPending`.
- Anything that usually arrives at once. A spinner that flashes for a tenth of a second feels
  slower than nothing.

## Example

```tsx
<Spinner label="Loading listings" showLabel />
```
