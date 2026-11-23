# PageBody

A screen's own area, below its bar: the screen's gutter, and its content centred in one of two widths.

## Use it for

- The content of every screen. A screen's root is a `PageBody`, so every screen has the same gutter and lines up with the next on any window.
- `width="wide"` (the default): what is looked over. Lists, tables, boards, Home, an entry with its side column.
- `width="narrow"`: what is read and filled in from top to bottom. Settings, a profile.
- `isInset` when the area is inside another `PageBody` (a tab of a screen) and only the width should change.

## Don't use it for

- The visual editor, which gives the page the whole window. That is `Workbench`.
- A band that runs from edge to edge (the greeting on Home). Put a `PageBody` inside it, or give the band the same width.
- A card's own width. Fields fill their card; the card fills the area.

## Behaviour

- The gutter is outside the width, so content edges line up between screens and with `Welcome`.
- Wide is the width of `max-w-7xl`; narrow that of `max-w-4xl`. Below those widths the content fills the window less the gutter.

## Example

```tsx
<PageBody width="narrow">
  <Card title="Your details">…</Card>
</PageBody>
```
