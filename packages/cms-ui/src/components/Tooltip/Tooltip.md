# Tooltip

A short hint shown when a control is hovered with a pointer or focused with the keyboard.

## Use it for

- Naming a control that shows only an icon. `IconButton` does this by itself.
- A keyboard shortcut, or a few words on what a control does.

## Don't use it for

- Anything a person needs in order to use the screen. Touch screens have no hover, so a tooltip
  can only repeat or add to what is already there.
- Text that is not a control. Only something that takes focus can have a tooltip.
- Long text, links or buttons. That is a dialog or help text under the field.

## Example

```tsx
<Tooltip content="Saves without publishing">
  <Button variant="secondary">Save draft</Button>
</Tooltip>
```
