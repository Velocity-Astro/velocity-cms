# Workbench

A form with what it makes shown large beside it: the sections of a page on one side, the page
itself on the other. The form keeps a column of its own width and scrolls with the screen; the
pane takes the rest and stays in view.

## Use it for

- Editing something whose result is worth seeing whole while it is edited, such as a page.

## Don't use it for

- A form with a few settings beside it. Use `Split`, whose side column is the narrow one.
- Two things of equal weight. Use `Grid`.

## Behaviour

From `xl` up the two sit side by side and the pane stays under the bar at the top of the screen,
as tall as the room there is. Below `xl` the pane follows the form. The form comes first in the
page, so the keyboard and screen readers reach it first; the pane is a named region.

## Example

```tsx
<Workbench paneLabel="The page" pane={<PagePreview … />}>
  <Card title="Sections">…</Card>
</Workbench>
```
