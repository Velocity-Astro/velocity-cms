import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Ellipsis } from 'lucide-react';
import { expect, it, vi } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { IconButton } from '../IconButton/index.js';
import { Menu, type MenuAction } from './Menu.js';

const actions: MenuAction[] = [
  { id: 'duplicate', label: 'Duplicate' },
  { id: 'unpublish', label: 'Unpublish', isDisabled: true },
  { id: 'delete', label: 'Delete', tone: 'danger' },
];
const example = (onAction: (id: string) => void) => (
  <Menu trigger={<IconButton label="More actions" icon={Ellipsis} />} actions={actions} onAction={onAction} />
);

it('is closed until its button is pressed, then lists its actions', async () => {
  const user = userEvent.setup();
  render(example(() => undefined));
  expect(screen.queryByRole('menu')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'More actions' }));
  expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Duplicate', 'Unpublish', 'Delete']);
});

it('reports the chosen action by id and closes', async () => {
  const onAction = vi.fn();
  const user = userEvent.setup();
  render(example(onAction));
  await user.click(screen.getByRole('button'));
  await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
  expect(onAction).toHaveBeenCalledWith('delete');
  expect(screen.queryByRole('menu')).toBeNull();
});

it('works with the keyboard alone and skips disabled actions', async () => {
  const onAction = vi.fn();
  const user = userEvent.setup();
  render(example(onAction));
  await user.tab();
  await user.keyboard('{Enter}');
  await user.keyboard('{ArrowDown}');
  await user.keyboard('{Enter}');
  expect(onAction).toHaveBeenCalledWith('delete');
});

it('closes on Escape and returns focus to its button', async () => {
  const user = userEvent.setup();
  render(example(() => undefined));
  await user.click(screen.getByRole('button'));
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('menu')).toBeNull();
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button')));
});

it('has no accessibility violations while open', async () => {
  const user = userEvent.setup();
  render(example(() => undefined));
  await user.click(screen.getByRole('button'));
  await expectAccessible(document.body);
});
