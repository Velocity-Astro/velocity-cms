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

## The whole window

`view="whole"` gives the two the whole window, over the editor's frame: `bar` across the top (a
`SaveBar` with `across="window"`), `outline` on the left from `lg` up (an `Outline` of the page's
sections, named by `outlineLabel`), the pane in the middle, and the form a panel on the right
that scrolls by itself, where what is chosen is edited. `isFormAway` slides the panel away so the pane has everything. Going from
one view to the other keeps the form and the pane as they are: nothing typed is lost and the pane
is not made again. While it has the window, the keyboard stays inside it. Always give `bar` a way
back.

## Example

```tsx
<Workbench paneLabel="The page" pane={<PagePreview … />}>
  <Card title="Sections">…</Card>
</Workbench>

<Workbench paneLabel="The page" view="whole" isFormAway={isAway} bar={<SaveBar across="window" … />} pane={<PagePreview isBare … />}>
  <Card title="Sections">…</Card>
</Workbench>
```
