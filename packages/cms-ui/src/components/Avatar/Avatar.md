# Avatar

A person's photo in a circle, or their initials where they have none.

## Use it for

- The signed-in person on their profile.
- A person in a list of people, beside their name.

## Don't use it for

- A picture of a thing, such as a listing. Use `Thumbnail`.
- A picture that says something the words do not. An Avatar is hidden from screen readers.

## Behaviour

- Without `src` it shows the first letters of up to two words of the name.
- The photo fills the circle and is cropped to it.
- It is never interactive.

## Example

```tsx
<Inline gap={3}>
  <Avatar name={person.name} src={person.image} />
  <Text weight="semibold">{person.name}</Text>
</Inline>
```
