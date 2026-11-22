# AppShell

The frame around every screen of the editor. Down the side, a dark rail of the editor's sections, each an icon with its name in a
tooltip, and the signed-in person at the bottom. Beside it, when the current section holds places of its own (each kind of content
under "Content"), a column that lists them under the section's name. Across the top, a bar with the site's name, the search and
the one or two things a person does from anywhere. Under it, the main area the screen is drawn in.

The column opens and closes with the screen: when a change of screen gives it places or takes them away, the panel slides to make
room or take it back, and the column is uncovered from its edge (a view transition, or its width where there is none). While it closes
it keeps what it held, out of reach (`inert`). A person who asks for less motion sees it simply open and close.

A screen with nothing for the bar, such as a home screen that opens on its own greeting, passes `isBarHidden`: from `md` up there is no
bar, and the search is still a key away. A phone keeps the bar, since its menu is there.

It owns the page's only `main` landmark, and its navigation: `Main` for the rail, and one named after the section for its column.

On a narrow window the rail and the column are behind a button in the bar: a panel lists every section with its places under it. The bar then has two rows: the menu button, the screen's title and the search, then the screen's buttons (a `PageHeader`'s or a `SaveBar`'s) across the whole width.

## Use it for

- Once, around the whole signed-in editor.

## Don't use it for

- Screens before sign-in. They have no navigation: use `AuthShell`.
- A second level of navigation inside one screen: use `Tabs`. A section's places (`children`) are for places with addresses of their own.

## Accessibility

The first thing a keyboard reaches is a link that jumps past the navigation to the main area.
A section on the rail shows only its icon, so its name is its link's words for screen readers and shows in a tooltip on hover and focus.
The current section and place are marked for screen readers, not only by their colour.
The search button names its shortcut but does not listen for it: the app does, so the keys work wherever the person is.

## Example

```tsx
<AppShell
  logoLabel="Velocity"
  siteName="Lakeshore Realty"
  siteDetail="lakeshore.example"
  navLabel="Main"
  menuLabel="Open the menu"
  skipLabel="Skip to content"
  search={{ label: 'Search, jump to or create anything', shortcut: '⌘K', onPress: openSearch }}
  actions={<Button icon={Plus}>Create</Button>}
  nav={[
    { id: 'top', items: [{ id: 'home', label: 'Home', href: '/admin', icon: House }] },
    {
      id: 'site',
      items: [
        {
          id: 'content',
          label: 'Content',
          href: '/admin/content/listings',
          icon: Layers,
          isCurrent: true,
          children: [{ id: 'types', label: 'Collections', items: [{ id: 'listings', label: 'Listings', href: '/admin/content/listings', isCurrent: true, count: '24' }] }],
        },
      ],
    },
    { id: 'admin', place: 'end', items: [{ id: 'settings', label: 'Settings', href: '/admin/settings', icon: Settings }] },
  ]}
  account={{ name: 'Dana Whitfield', detail: 'Owner', label: 'Account', actions: [{ id: 'sign-out', label: 'Sign out' }], onAction }}
>
  <ListingsScreen />
</AppShell>
```
