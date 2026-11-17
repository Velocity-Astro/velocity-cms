# AppShell

The frame around every screen of the editor: a sidebar with the site's name, the navigation in named groups and the signed-in person,
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
  logo={<Logo label="Velocity" />}
  siteName="Lakeshore Realty"
  siteDetail="Real estate template"
  navLabel="Main"
  skipLabel="Skip to content"
  nav={[
    { id: 'top', items: [{ id: 'home', label: 'Home', href: '/admin', icon: House }] },
    {
      id: 'content',
      label: 'Content',
      items: [{ id: 'listings', label: 'Listings', href: '/admin/content/listings', icon: Building2, isCurrent: true }],
    },
  ]}
  account={{ name: 'Dana Whitfield', detail: 'Owner', label: 'Account', actions: [{ id: 'sign-out', label: 'Sign out' }], onAction }}
>
  <ListingsScreen />
</AppShell>
```
