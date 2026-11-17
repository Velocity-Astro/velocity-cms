# SaveBar

The bar that stays at the top of an editing screen. On the left, the way back, what is being
edited and where it stands; on the right, the buttons that save and publish it. It is always in
the same place, so saving never has to be looked for, however long the form is.

## Use it for

- Every screen that edits something and saves it on purpose: an entry, a content type, settings.

## Don't use it for

- Screens where each change takes effect at once. They have nothing to save.
- More than three buttons. Put the rest in a `Menu`.

## Accessibility

The bar is a named region, so it can be jumped to. Its status is announced when it changes, so a
screen reader hears "Saved" without moving focus.

## Example

```tsx
<SaveBar
  label="Save and publish"
  back={{ href: '/admin/content/listings', label: 'Listings' }}
  title="Updated 1948 bungalow facing the green"
  status={<><Tag tone="warning">Unpublished changes</Tag><Text size="sm" tone="muted">Saved 2 minutes ago</Text></>}
  actions={<><Button variant="secondary" onPress={save}>Save draft</Button><Button onPress={publish}>Publish</Button></>}
/>
```
