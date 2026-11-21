import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Outline, type OutlineItem } from './Outline.js';

const items: OutlineItem[] = [
  { id: 's1', label: 'Page opening' },
  { id: 's2', label: 'Two columns' },
  { id: 's3', label: 'Text', depth: 1 },
];

it('lists the parts by name under its title, with the current one marked', () => {
  render(<Outline title="Sections" items={items} currentId="s2" onChoose={() => undefined} emptyText="None" />);
  const list = screen.getByRole('listbox', { name: 'Sections' });
  expect(within(list).getAllByRole('option').map((option) => option.textContent)).toEqual(['Page opening', 'Two columns', 'Text']);
  expect(within(list).getByRole('option', { name: 'Two columns' }).getAttribute('aria-selected')).toBe('true');
});

it('goes to a part on a press, the current one too', async () => {
  const user = userEvent.setup();
  const chosen: string[] = [];
  render(<Outline title="Sections" items={items} currentId="s2" onChoose={(id) => chosen.push(id)} emptyText="None" />);
  await user.click(screen.getByRole('option', { name: 'Text' }));
  await user.click(screen.getByRole('option', { name: 'Two columns' }));
  expect(chosen).toContain('s3');
  expect(chosen).toContain('s2');
});

it('goes to a part with the arrow keys and Enter', async () => {
  const user = userEvent.setup();
  const chosen: string[] = [];
  render(<Outline title="Sections" items={items} onChoose={(id) => chosen.push(id)} emptyText="None" />);
  await user.tab();
  await user.keyboard('{ArrowDown}{Enter}');
  expect(chosen.at(-1)).toBe('s2');
});

it('says so when there is nothing to list', () => {
  render(<Outline title="Sections" items={[]} onChoose={() => undefined} emptyText="No sections yet." />);
  expect(screen.getByText('No sections yet.')).toBeTruthy();
});

it('has no accessibility violations', async () => {
  const { container } = render(<Outline title="Sections" items={items} currentId="s1" onChoose={() => undefined} emptyText="None" />);
  await expectAccessible(container);
});
