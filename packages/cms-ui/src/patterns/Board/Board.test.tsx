import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Board, type BoardProps } from './Board.js';

const props = (changes: Partial<BoardProps> = {}): BoardProps => ({
  label: 'Pipeline',
  columns: [
    { id: 'new', title: 'New', count: '2', items: [{ id: 'ana', title: 'Ana Ruiz', detail: 'ana@example.com', notes: [{ text: 'Dana' }] }, { id: 'tom', title: 'Tom Lee' }] },
    { id: 'contacted', title: 'Contacted', count: '14', items: [{ id: 'li', title: 'Li Wei' }], more: '13 more' },
    { id: 'won', title: 'Won', count: '0', tone: 'success', items: [] },
  ],
  emptyText: 'Nobody here',
  onOpen: vi.fn(),
  onMove: vi.fn(),
  moveLabel: (title) => `Move ${title}`,
  ...changes,
});

it('shows each column by name with how many it holds, its cards, and what an empty one says', () => {
  render(<Board {...props()} />);
  const board = within(screen.getByRole('group', { name: 'Pipeline' }));
  expect(board.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['New', 'Contacted', 'Won']);
  const fresh = within(board.getByRole('region', { name: 'New' }));
  expect(fresh.getByText('2')).toBeTruthy();
  expect(fresh.getAllByRole('listitem').map((card) => within(card).getAllByRole('button')[0]?.textContent)).toEqual(['Ana Ruizana@example.comDana', 'Tom Lee']);
  expect(within(board.getByRole('region', { name: 'Contacted' })).getByText('13 more')).toBeTruthy();
  expect(within(board.getByRole('region', { name: 'Won' })).getByText('Nobody here')).toBeTruthy();
});

it('opens a card by pointer and by keyboard', async () => {
  const user = userEvent.setup();
  const all = props();
  render(<Board {...all} />);
  await user.click(screen.getByRole('button', { name: /^Ana Ruiz/ }));
  expect(all.onOpen).toHaveBeenCalledWith('ana');
  screen.getByRole('button', { name: 'Li Wei' }).focus();
  await user.keyboard('{Enter}');
  expect(all.onOpen).toHaveBeenLastCalledWith('li');
});

it('moves a card from its menu, which names every other column and not its own', async () => {
  const user = userEvent.setup();
  const all = props();
  render(<Board {...all} />);
  await user.click(screen.getByRole('button', { name: 'Move Tom Lee' }));
  expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Contacted', 'Won']);
  await user.click(screen.getByRole('menuitem', { name: 'Won' }));
  expect(all.onMove).toHaveBeenCalledWith('tom', 'won');
});

it('moves a card with the keyboard alone', async () => {
  const user = userEvent.setup();
  const all = props();
  render(<Board {...all} />);
  screen.getByRole('button', { name: 'Move Li Wei' }).focus();
  await user.keyboard('{Enter}');
  await user.keyboard('{Enter}');
  expect(all.onMove).toHaveBeenCalledWith('li', 'new');
});

it('offers no menu when there is nowhere else to go', () => {
  const [only] = props().columns;
  render(<Board {...props({ columns: only ? [only] : [] })} />);
  expect(screen.queryByRole('button', { name: /^Move/ })).toBeNull();
});

it('is accessible', async () => {
  const { container } = render(<Board {...props()} />);
  await expectAccessible(container);
});
