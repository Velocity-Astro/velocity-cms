# Welcome

The top of a screen that greets the person, across the whole width on a faint grid: a few words over the title, the title in large
type with one phrase, such as the person's name, set apart in the brand's colour, a sentence under it, what to do first, and beside it a picture of the site. On a phone the picture is left out, so the screen's
content is not pushed far down.

## Use it for

- The top of Home, once.

## Don't use it for

- Any other screen: use `PageHeader`, which every screen has.
- More than one highlighted phrase. The brand's colour is spent once on a screen.

## Accessibility

The title is the screen's only level 1 heading. The highlighted phrase is a `mark`, and is read with the rest of the title.
The phrase is in the brand's colour for words (`brand-text`), which passes WCAG AA on the page in both themes.

## Example

```tsx
<Welcome
  eyebrow="Saturday, 21 November"
  title="Good morning, Dana. 3 drafts are waiting."
  highlight="Dana"
  description="One has changes that are not on the site yet."
  actions={<Button icon={ArrowRight}>Continue “18 Alder Court”</Button>}
  aside={<SiteWindow address="lakeshore.example" src="/" title="The home page" label="Edit the home page" onPress={edit} />}
/>
```
