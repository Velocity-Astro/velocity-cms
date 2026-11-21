# BarChart

Values side by side as bars. `columns` lays them out as a run, such as one bar a day; `rows` lays out named things, such as
each kind of content, with each value written beside its bar. One bar may stand out (`highlightId`), in the brand's colour.

The bars are drawn with the theme's own sizes: a bar's length goes in twentieths of the longest, so the chart is a picture of
how the values compare, and the words carry the values themselves.

## Use it for

- Breaking up a screen of numbers with a picture of them: submissions a day, entries by type, the pipeline by stage.

## Don't use it for

- Exact figures someone will read off: put them in a `Table` or a `Stat`.
- Progress toward one target: use `Meter`.
- A highlighted bar on a screen that already spends its orange elsewhere.

## Accessibility

The bars are hidden from screen readers. The chart is a figure named by `label`, and holds a list of each bar's label and its
value in words, which screen readers read in place of the picture.

## Example

```tsx
<BarChart
  label="Submissions in the last 7 days"
  highlightId="sun"
  bars={[
    { id: 'mon', label: 'Mon', value: 2, valueText: '2 submissions' },
    { id: 'sun', label: 'Sun', value: 5, valueText: '5 submissions' },
  ]}
/>
<BarChart label="Entries by type" layout="rows" bars={[{ id: 'listings', label: 'Listings', value: 16, valueText: '16' }]} />
```
