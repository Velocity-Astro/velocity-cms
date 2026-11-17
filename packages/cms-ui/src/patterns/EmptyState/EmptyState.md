# EmptyState

What a screen shows where its content will be, before there is any. An empty screen is the first
thing a new site owner sees, so it says what belongs here and offers the one thing to do next.

## Use it for

- A list with nothing in it yet.
- A search or filter with no results. Say so, and offer to clear the filter.

## Don't use it for

- Something that failed to load. That is an error, with a way to try again.
- Content that is still loading.

## Example

```tsx
<EmptyState
  icon={House}
  title="No listings yet"
  description="Listings you add appear on the site as soon as you publish them."
  action={<Button icon={Plus} onPress={create}>New listing</Button>}
/>
```
