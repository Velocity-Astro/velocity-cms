# SiteWindow

A page of the site in a small browser window, as visitors see it now: the site's address across the top, the page drawn at a
desktop's width and shown at half its size, and at its foot a few words (when it was last published) and what pressing it does.
The whole card is one link.

## Use it for

- Beside the greeting on Home, leading to the home page in the visual editor.

## Don't use it for

- Editing a page, or a preview of what has not been published: use `PagePreview`, which shows the draft and can be worked on.
- A picture of something that is not a page of the site.

## Accessibility

The page inside cannot be pressed or reached by the keyboard, and screen readers skip it: the card's one link, at its foot, is
what the keyboard reaches, and it says what pressing the card does. It covers the whole card for a pointer.

## Example

```tsx
<SiteWindow
  address="lakeshore.example"
  src="/"
  title="The home page of Lakeshore Realty"
  label="Edit the home page"
  meta="Published 3 days ago"
  onPress={() => go(paths.visualEntry('pages', home.id))}
/>
```
