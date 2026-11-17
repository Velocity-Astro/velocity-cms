# Switch

A setting that is on or off, and takes effect the moment it is pressed.

## Use it for

- Turning something on or off right away: "Show on homepage", "Email me when a form is sent".

## Don't use it for

- A choice that is saved later with the rest of a form: use `Checkbox`, so nobody thinks it has
  already happened.
- Choosing between two things that are not on and off, such as "Monthly" and "Yearly".

## Example

```tsx
<Switch label="Show on homepage" isSelected={featured} onChange={setFeatured} />
```
