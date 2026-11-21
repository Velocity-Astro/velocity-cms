# Meter

How far something is toward a whole: a bar in the brand's colour, with what is measured and how far along, in words, above it.
The bar moves in twentieths of its track, so its width is always a step of the scale.

## Use it for

- Progress toward a target, such as what was won this month against the pipeline's monthly target.

## Don't use it for

- Something still loading: use `Spinner` or `LoadingState`.
- More than one on a screen. Its colour is the screen's one orange.

## Accessibility

It is a meter, named by its label, and reads out `valueText`, so the words, not the bar, say how far along it is.

## Example

```tsx
<Meter label="November target" value={13800} max={20000} valueText="69% of $20,000" />
```
