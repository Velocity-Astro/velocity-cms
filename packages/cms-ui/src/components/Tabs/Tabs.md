# Tabs

Views of the same thing, one shown at a time.

## Use it for

- The sections of one entry or one settings page: Content, SEO, History.
- Two to six views of roughly equal weight.

## Don't use it for

- Steps that must be done in order.
- Moving between different things. That is navigation, made of links.
- Hiding a form's required fields. An error in a tab nobody is looking at is easy to miss.

## Keyboard

Tab moves to the selected tab, the left and right arrows change it, and Tab again moves into the
panel.

## Example

```tsx
<Tabs
  label="Listing sections"
  tabs={[
    { id: 'content', label: 'Content', content: <ContentForm /> },
    { id: 'seo', label: 'SEO', content: <SeoForm /> },
  ]}
/>
```
