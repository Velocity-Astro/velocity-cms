# Link

Goes to another page, inside the editor or outside it.

## Use it for

- Anything that changes the address: an entry's title in a list, "View on site", a help page.

## Don't use it for

- Something that happens on this page, such as saving or opening a dialog: use `Button`.
- "Click here" or "Read more". The words must make sense read on their own.

## Example

```tsx
<Link href="/admin/listings/42">6214 Lakeshore Drive</Link>
<Link href={publicUrl} opensInNewTab tone="muted">View on site</Link>
```
