# AppShell

The frame around every screen of the editor: a sidebar with the site's name and the navigation,
and the main area the screen is drawn in. It owns the page's only `main` and `nav` landmarks.

## Use it for

- Once, around the whole signed-in editor.

## Don't use it for

- Screens before sign-in. They have no navigation.
- A second level of navigation inside a screen: use `Tabs`.

## Accessibility

The first thing a keyboard reaches is a link that jumps past the navigation to the main area.
The current screen's link is marked for screen readers, not only by its colour.

## Example

```tsx
<AppShell
  brand={<Text weight="semibold">Lakeshore Realty</Text>}
  navLabel="Main"
  skipLabel="Skip to content"
  nav={[
    { id: 'listings', label: 'Listings', href: '/admin/listings', icon: House, isCurrent: true },
    { id: 'media', label: 'Media', href: '/admin/media', icon: Image },
  ]}
>
  <ListingsScreen />
</AppShell>
```
