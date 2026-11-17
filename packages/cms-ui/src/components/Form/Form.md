# Form

Fields that are sent together, laid out in a column. Enter in any field sends it, and so does a
`Button` with `type="submit"`. The page never reloads; `onSubmit` is called instead.

The browser's own validation bubbles are switched off. Check the values in `onSubmit` and give
each field its `errorMessage`, so errors are worded and styled like the rest of the editor.

## Use it for

- Any group of fields with one button that sends them: sign in, rename, a filter with "Apply".

## Don't use it for

- Fields that each save by themselves. They need no form.
- Layout alone. Use `Stack`.

## Example

```tsx
<Form onSubmit={signIn}>
  <TextField label="Email" type="email" value={email} onChange={setEmail} isRequired />
  <Button type="submit">Email me a sign-in link</Button>
</Form>
```
