# PageHeader

The top of every screen: its title, one sentence on what it is for (or how much it holds), and its main actions. Using
it everywhere is what makes each screen start the same way, with exactly one level 1 heading.

Inside `AppShell` it is drawn in the shell's bar across the top, on one line: the title and its sentence on the left, the
actions on the right, beside the search. The screen's own area then holds only its content, with no heading of its own.
Outside a shell (a story, a test of one part) it is drawn where it stands.

## On a phone

In the bar a phone has one row, as on any phone: the menu, the title cut to fit, the screen's buttons and the
search. The sentence under the title is left out there. Put the main button (one, two at most) in `actions` and
give it `collapses`, so it is its icon alone; put the rest in `secondary`, which shows them as buttons from `md` up
and as one menu (⋯) on a phone.

## Use it for

- The first thing on every screen of the editor.

## Don't use it for

- The heading of a section inside a screen: use `Heading` at level 2.
- More than one primary button. The rest are secondary, or go in a `Menu`.

## Example

```tsx
<PageHeader
  title="Listings"
  description="Every property on the site."
  secondary={{ moreLabel: 'More actions', actions: [{ id: 'import', label: 'Import', icon: FileUp, onPress: importing }] }}
  actions={<Button icon={Plus} collapses onPress={create}>New listing</Button>}
/>
```
