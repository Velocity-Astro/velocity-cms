# Spotlight

Brings what it holds into view and marks it for a moment, when something elsewhere on the screen
pointed at it: a field of a form, when its words were clicked on the page beside the form.

## Use it for

- One field, or one small group, that another part of the screen can point at.

## Don't use it for

- A section that opens. `SectionList` brings its own rows into view (`revealId`).
- An error. A field shows its own `errorMessage`.
- Something new arriving. Use a `Toast`.

## Behaviour

- Each time `at` changes to a value, what is inside is scrolled into view, by as little as it
  takes, and ringed for a moment. With `at` left out nothing happens, and a ring that was showing goes.
- It moves no focus and announces nothing: the person asked for it with a click of their own.
- When it is drawn for the first time with `at` already set, it shows at once. Pass `at` only
  while the pointing is news.

## Example

```tsx
<Spotlight at={pressed?.field === 'title' ? pressed.at : undefined}>
  <TextField label="Title" />
</Spotlight>
```
