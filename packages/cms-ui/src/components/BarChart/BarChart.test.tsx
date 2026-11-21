import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { BarChart } from './BarChart.js';

const bars = [
  { id: 'mon', label: 'Mon', value: 2, valueText: '2 submissions' },
  { id: 'tue', label: 'Tue', value: 0, valueText: 'none' },
  { id: 'wed', label: 'Wed', value: 8, valueText: '8 submissions' },
];

it('is a figure named by its label, whose values screen readers read as a list', () => {
  render(<BarChart label="Submissions this week" bars={bars} />);
  const figure = screen.getByRole('figure', { name: 'Submissions this week' });
  expect(within(figure).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Mon: 2 submissions', 'Tue: none', 'Wed: 8 submissions']);
});

it('draws each bar in twentieths of the longest, with a sliver for any value above nothing', () => {
  const { container } = render(<BarChart label="Week" bars={bars} highlightId="wed" />);
  const classes = [...container.querySelectorAll('[aria-hidden] .rounded-t-sm')].map((bar) => bar.getAttribute('class') ?? '');
  expect(classes[0]).toContain('h-5/20');
  expect(classes[1]).toContain('h-0');
  expect(classes[2]).toContain('h-full');
  expect(classes[2]).toContain('bg-brand-fill');
  expect(classes[0]).not.toContain('bg-brand-fill');
});

it('lays out named things as rows, each value written beside its bar', () => {
  render(<BarChart label="By type" layout="rows" bars={[{ id: 'listings', label: 'Listings', value: 16, valueText: '16 entries' }]} />);
  expect(screen.getByText('Listings', { selector: '[aria-hidden] *' })).toBeTruthy();
  expect(screen.getByText('16 entries', { selector: '[aria-hidden] *' })).toBeTruthy();
});

it('has no accessibility violations', async () => {
  const { container } = render(<BarChart label="Submissions this week" bars={bars} highlightId="wed" />);
  await expectAccessible(container);
});
