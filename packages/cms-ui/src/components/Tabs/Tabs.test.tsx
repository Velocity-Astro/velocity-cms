import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Tabs } from './Tabs.js';

const tabs = [
  { id: 'content', label: 'Content', content: 'The fields' },
  { id: 'seo', label: 'SEO', content: 'Search results' },
];

it('shows the first tab, in a named tab list', () => {
  render(<Tabs label="Listing sections" tabs={tabs} />);
  expect(screen.getByRole('tablist', { name: 'Listing sections' })).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'Content' }).getAttribute('aria-selected')).toBe('true');
  expect(screen.getByRole('tabpanel').textContent).toBe('The fields');
});

it('changes tab on a press and reports its id', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<Tabs label="Listing sections" tabs={tabs} onChange={onChange} />);
  await user.click(screen.getByRole('tab', { name: 'SEO' }));
  expect(onChange).toHaveBeenCalledWith('seo');
  expect(screen.getByRole('tabpanel').textContent).toBe('Search results');
});

it('changes tab with the arrow keys', async () => {
  const user = userEvent.setup();
  render(<Tabs label="Listing sections" tabs={tabs} />);
  await user.tab();
  await user.keyboard('{ArrowRight}');
  expect(screen.getByRole('tab', { name: 'SEO' }).getAttribute('aria-selected')).toBe('true');
});

it('has no accessibility violations', async () => {
  const { container } = render(<Tabs label="Listing sections" tabs={tabs} />);
  await expectAccessible(container);
});
