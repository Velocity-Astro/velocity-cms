import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Segmented } from './Segmented.js';

const options = [
  { id: 'all', label: 'All' },
  { id: 'published', label: 'Published' },
  { id: 'drafts', label: 'Drafts' },
];

it('shows which option is chosen, and tells of a new choice', async () => {
  const user = userEvent.setup();
  const chosen: string[] = [];
  render(<Segmented label="Show" options={options} selected="all" onChange={(id) => chosen.push(id)} />);
  expect(screen.getByRole('radiogroup', { name: 'Show' })).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'All' }).getAttribute('aria-checked')).toBe('true');
  await user.click(screen.getByRole('radio', { name: 'Drafts' }));
  expect(chosen).toEqual(['drafts']);
});

it('always keeps one chosen: pressing the chosen one changes nothing', async () => {
  const user = userEvent.setup();
  const chosen: string[] = [];
  render(<Segmented label="Show" options={options} selected="all" onChange={(id) => chosen.push(id)} />);
  await user.click(screen.getByRole('radio', { name: 'All' }));
  expect(chosen).toEqual([]);
});

it('moves between options with the arrow keys', async () => {
  const user = userEvent.setup();
  render(<Segmented label="Show" options={options} selected="all" onChange={() => undefined} />);
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'All' }));
  await user.keyboard('{ArrowRight}');
  expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Published' }));
});

it('has no accessibility violations', async () => {
  const { container } = render(<Segmented label="Show" options={options} selected="all" onChange={() => undefined} />);
  await expectAccessible(container);
});
