# IconButton

A button that shows only an icon. Its `label` is required: it is what a screen reader says, and it
is shown as a tooltip on hover and focus, so nobody has to guess what the icon means.

## Use it for

- Actions that repeat in every row or toolbar, where words would crowd the screen: more actions,
  close, move up.
- Icons most people already know.

## Don't use it for

- The main action of a screen. Use a `Button` with words.
- An action whose icon needs explaining. If the tooltip is the only way to understand it, use words.

## Example

```tsx
<IconButton label="More actions" icon={Ellipsis} onPress={openMenu} />
```
