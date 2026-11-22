# Welcome

The top of a screen that greets the person, across the whole width on a faint grid: a few words over the title, a greeting in large
type with the person's name on its own line in the brand's colour (cut short when too long, never broken across two lines), what stands now in smaller words under it, what to do first, and beside it a picture of the site. On a phone the picture is left out, so the screen's
content is not pushed far down.

## Use it for

- The top of Home, once.

## Don't use it for

- Any other screen: use `PageHeader`, which every screen has.
- Counts or news in the heading: they go in `description`, so the greeting stays short. The brand's colour is spent once on a screen, on the name.

## Accessibility

The title is the screen's only level 1 heading. The name is a `mark`, and is read with the rest of the title ("Good morning, Dana").
The name is in the brand's colour for words (`brand-text`), which passes WCAG AA on the page in both themes.

## Example

```tsx
<Welcome
  eyebrow="Saturday, 21 November"
  title="Good morning,"
  name="Dana Whitfield"
  description="3 drafts are waiting. Here is where Lakeshore Realty stands."
  actions={<Button icon={ArrowRight}>Continue “18 Alder Court”</Button>}
  aside={<SiteWindow address="lakeshore.example" src="/" title="The home page" label="Edit the home page" onPress={edit} />}
/>
```
