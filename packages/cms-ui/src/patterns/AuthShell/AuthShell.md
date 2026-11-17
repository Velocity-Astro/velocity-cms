# AuthShell

The frame around the screens a person sees before they are signed in: one card in the middle of
the page, with the site's name, a title and the form. It owns the page's `main` landmark.

## Use it for

- Sign in, first-time setup, accepting an invitation.

## Don't use it for

- Anything after sign-in. Those screens sit inside `AppShell`.

## Example

```tsx
<AuthShell brand={<Text weight="semibold">Lakeshore Realty</Text>} title="Sign in">
  <Form onSubmit={sendLink}>
    <TextField label="Email" type="email" isRequired />
    <Button type="submit" fullWidth>Email me a sign-in link</Button>
  </Form>
</AuthShell>
```
