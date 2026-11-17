# Checkbox

One yes-or-no choice, with its label.

## Use it for

- A setting that is on or off and is saved with the rest of the form: "Featured listing".
- Picking several things from a short list, one checkbox each.
- Selecting rows. `isIndeterminate` is for the "select all" box when only some rows are selected.

## Don't use it for

- Choosing one of several: that is a select.
- A setting that takes effect the moment it is pressed. That is a switch, with its own component.
- A label that asks a question. Write what being ticked means: "Show on homepage".

## Example

```tsx
<Checkbox label="Featured listing" isSelected={featured} onChange={setFeatured} />
```
