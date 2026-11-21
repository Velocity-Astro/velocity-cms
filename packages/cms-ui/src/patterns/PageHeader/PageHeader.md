# PageHeader

The top of every screen: its title, one sentence on what it is for (or how much it holds), and its main actions. Using
it everywhere is what makes each screen start the same way, with exactly one level 1 heading.

Inside `AppShell` it is drawn in the shell's bar across the top, on one line: the title and its sentence on the left, the
actions on the right, beside the search. The screen's own area then holds only its content, with no heading of its own.
Outside a shell (a story, a test of one part) it is drawn where it stands.

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
  actions={<Button icon={Plus} onPress={create}>New listing</Button>}
/>
```
