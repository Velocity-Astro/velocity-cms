# LoadingMark

The whole screen while the app opens: the Velocity mark in the middle, quiet, on the page's own
background. Its three facets arrive from their own sides in grey and take their colour, the orange top
first, then fade and assemble again until the app is there. The lower facets follow the text's colour, so
the mark reads in both themes, and the orange is the one colour on the screen.

## Use it for

- The editor's first screen, before there is any layout to keep: while it learns who is signed in.

## Don't use it for

- A screen whose layout is known: use `LoadingState` with its `shape`, so the screen keeps its place.
- A part of a screen, or an action under way: use `Spinner` or `Button isPending`.

## Accessibility

It is a `status`, and screen readers hear its label. The mark itself is hidden from them. People who ask
for less motion see the whole mark, still.

## Example

```tsx
<LoadingMark label="Opening the editor" />
```
