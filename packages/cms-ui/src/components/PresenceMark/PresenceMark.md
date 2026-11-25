# PresenceMark

Says that someone else is working where the person may be about to: a ring round what it holds and
who it is, in words. It also says when the person's own focus comes inside, so their editor can
tell the others where they are.

## Use it for

- One field of a form several people may have open at once.

## Don't use it for

- Who has the whole screen open. Use a `Tag` in the screen's bar.
- Pointing at a field from elsewhere on the screen. Use `Spotlight`.
- Something that went wrong. A field shows its own `errorMessage`.

## Behaviour

- With `label` it rings what is inside and shows the label under it. The label is a status: it is
  read out when it appears, and takes no focus.
- Without `label` it shows nothing and takes no room.
- `onEnter` is called when focus comes inside from outside, by keyboard or pointer, and not again
  while it moves about inside.
- It stops nobody: the person can still type where someone else is.

## Example

```tsx
<PresenceMark label={others.get(field.id)} onEnter={() => iAmAt(field.id)}>
  <TextField label="Title" />
</PresenceMark>
```
