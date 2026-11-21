# ColorPicker

A colour, typed as a hex colour or chosen in an area of shades and a slider of hues, or from a
few suggested ones. What it hands back is always a hex colour (`#1f3a5f`), or nothing when the
field is emptied.

The button beside the field shows the colour and opens the area. A template's own palette goes
in `presets`, a press away.

## Use it for

- A colour of the site's theme that a person sets: a brand colour, the colour of buttons.

## Don't use it for

- A choice among a template's own looks, which are named (a section's background): use a
  `Segmented` with swatches, so what is stored is the look's name.

## Keyboard

Tab reaches the button and the field. The button opens the area: arrows move in it and along
the slider of hues, and Escape closes it. A colour can always be typed instead.

## Example

```tsx
<ColorPicker
  label="Brand colour"
  pickLabel="Choose a colour"
  hueLabel="Hue"
  presets={['#1f3a5f', '#c2410c']}
  presetsLabel="Suggested colours"
  value={colour}
  onChange={setColour}
/>
```
