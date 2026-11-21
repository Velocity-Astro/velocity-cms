import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { FileText, Plus } from 'lucide-react';
import { useState } from 'react';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { CommandPalette, type CommandGroup } from './CommandPalette.js';

const groups: CommandGroup[] = [
  {
    id: 'go',
    label: 'Go to',
    items: [
      { id: 'listings', label: 'Listings', detail: 'Content', icon: FileText },
      { id: 'agents', label: 'Agents', detail: 'Content', icon: FileText },
      { id: 'settings', label: 'Settings', keywords: 'email storage' },
    ],
  },
  { id: 'create', label: 'Create', items: [{ id: 'new-listing', label: 'New listing', icon: Plus }] },
  { id: 'empty', label: 'Nothing here', items: [] },
];

function Example({ onAction, onOpenChange }: { readonly onAction: (id: string) => void; readonly onOpenChange?: (isOpen: boolean) => void }) {
  const [isOpen, setOpen] = useState(true);
  return (
    <CommandPalette
      isOpen={isOpen}
      onOpenChange={(open) => {
        setOpen(open);
        onOpenChange?.(open);
      }}
      label="Search and commands"
      placeholder="Search, jump to or create anything"
      emptyText="Nothing matches that."
      groups={groups}
      onAction={onAction}
    />
  );
}

it('opens with the box focused and every group that has something in it', () => {
  render(<Example onAction={() => undefined} />);
  const dialog = screen.getByRole('dialog', { name: 'Search and commands' });
  expect(document.activeElement).toBe(within(dialog).getByRole('searchbox', { name: 'Search, jump to or create anything' }));
  expect(within(dialog).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['ListingsContent', 'AgentsContent', 'Settings', 'New listing']);
  expect(within(dialog).queryByText('Nothing here')).toBeNull();
});

it('narrows what is shown as the person types, by words, detail and keywords', async () => {
  const user = userEvent.setup();
  render(<Example onAction={() => undefined} />);
  await user.keyboard('list');
  expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['ListingsContent', 'New listing']);
  await user.clear(screen.getByRole('searchbox'));
  await user.keyboard('storage');
  expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Settings']);
});

it('says so when nothing matches', async () => {
  const user = userEvent.setup();
  render(<Example onAction={() => undefined} />);
  await user.keyboard('zzz');
  // The message stands where the matches would, in the list's own row.
  expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Nothing matches that.']);
});

it('chooses with the arrow keys and Enter, and closes', async () => {
  const user = userEvent.setup();
  const chosen: string[] = [];
  render(<Example onAction={(id) => chosen.push(id)} />);
  await user.keyboard('a');
  await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
  expect(chosen).toEqual(['agents']);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('chooses with a pointer', async () => {
  const user = userEvent.setup();
  const chosen: string[] = [];
  render(<Example onAction={(id) => chosen.push(id)} />);
  await user.click(screen.getByRole('menuitem', { name: 'New listing' }));
  expect(chosen).toEqual(['new-listing']);
});

it('closes with Escape, choosing nothing', async () => {
  const user = userEvent.setup();
  const chosen: string[] = [];
  const opened: boolean[] = [];
  render(<Example onAction={(id) => chosen.push(id)} onOpenChange={(open) => opened.push(open)} />);
  await user.keyboard('{Escape}');
  if (screen.queryByRole('dialog')) await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(chosen).toEqual([]);
  expect(opened).toEqual([false]);
});

it('has no accessibility violations', async () => {
  render(<Example onAction={() => undefined} />);
  await expectAccessible(screen.getByRole('dialog'));
});
