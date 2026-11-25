import { act, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { SectionList, type SectionListProps } from './SectionList.js';

const actions = [
  { id: 'duplicate', label: 'Duplicate' },
  { id: 'remove', label: 'Remove', tone: 'danger' as const },
];

const props = (changes: Partial<SectionListProps> = {}): SectionListProps => ({
  label: 'Sections',
  items: [
    { id: 'a', title: 'Page opening', summary: 'Why list with us', content: <span>Opening fields</span>, actions },
    { id: 'b', title: 'Questions', content: <span>Question fields</span>, actions },
    { id: 'c', title: 'Call to action', content: <span>Action fields</span>, actions },
  ],
  openIds: [],
  onOpenChange: vi.fn(),
  emptyText: 'No sections yet',
  addLabel: 'Add section',
  onAdd: vi.fn(),
  onMove: vi.fn(),
  onAction: vi.fn(),
  moveUpLabel: (position) => `Move section ${position} up`,
  moveDownLabel: (position) => `Move section ${position} down`,
  moreLabel: (position) => `More for section ${position}`,
  dragLabel: (position) => `Drag section ${position}`,
  ...changes,
});

it('shows its sections in order inside a group named by its label, each by kind and a few of its words', () => {
  render(<SectionList {...props()} />);
  const group = within(screen.getByRole('group', { name: 'Sections' }));
  expect(group.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['Page openingWhy list with us', 'Questions', 'Call to action']);
});

it('opens and closes a section from its heading, by pointer and by keyboard, and shows the fields of an open one', async () => {
  const user = userEvent.setup();
  const all = props({ openIds: ['b'] });
  render(<SectionList {...all} />);
  expect(screen.getByText('Question fields')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Questions' }).getAttribute('aria-expanded')).toBe('true');
  await user.click(screen.getByRole('button', { name: /Page opening/ }));
  expect(all.onOpenChange).toHaveBeenCalledWith('a', true);
  screen.getByRole('button', { name: 'Questions' }).focus();
  await user.keyboard('{Enter}');
  expect(all.onOpenChange).toHaveBeenCalledWith('b', false);
});

it('moves a section, but not the first up or the last down', async () => {
  const user = userEvent.setup();
  const all = props();
  render(<SectionList {...all} />);
  await user.click(screen.getByRole('button', { name: 'Move section 2 up' }));
  expect(all.onMove).toHaveBeenCalledWith(1, 0);
  await user.click(screen.getByRole('button', { name: 'Move section 2 down' }));
  expect(all.onMove).toHaveBeenCalledWith(1, 2);
  expect(screen.getByRole('button', { name: 'Move section 1 up' })).toHaveProperty('disabled', true);
  expect(screen.getByRole('button', { name: 'Move section 3 down' })).toHaveProperty('disabled', true);
});

it('offers each section its actions in a menu', async () => {
  const user = userEvent.setup();
  const all = props();
  render(<SectionList {...all} />);
  await user.click(screen.getByRole('button', { name: 'More for section 3' }));
  await user.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
  expect(all.onAction).toHaveBeenCalledWith('c', 'duplicate');
});

it('marks a section in an unusual state, and says what is wrong inside a closed one', () => {
  const all = props();
  const [first, second, third] = all.items;
  if (!first || !second || !third) throw new Error('Three sections were expected.');
  render(<SectionList {...all} items={[first, { ...second, tag: 'Hidden' }, { ...third, problem: 'Title: fill this in before publishing.' }]} />);
  expect(screen.getByRole('button', { name: /Questions/ }).textContent).toContain('Hidden');
  expect(screen.getByText('Title: fill this in before publishing.')).toBeTruthy();
});

it('says who else is working in a section, beside its title', () => {
  const all = props();
  const [first, ...rest] = all.items;
  if (!first) throw new Error('A section was expected.');
  render(<SectionList {...all} items={[{ ...first, presence: 'Ana Ruiz is here' }, ...rest]} />);
  expect(screen.getAllByRole('button').some((button) => button.textContent.includes('Ana Ruiz is here'))).toBe(true);
});

it('says so when it is empty, shows what is wrong, adds, and stops adding when full', async () => {
  const user = userEvent.setup();
  const all = props({ items: [], errorMessage: 'Add at least one section.' });
  const { rerender } = render(<SectionList {...all} />);
  expect(screen.getByText('No sections yet')).toBeTruthy();
  expect(screen.getByText('Add at least one section.')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Add section' }));
  expect(all.onAdd).toHaveBeenCalledOnce();
  rerender(<SectionList {...all} isFull />);
  expect(screen.getByRole('button', { name: 'Add section' })).toHaveProperty('disabled', true);
});

/** Picks a section up by its handle with the keyboard, goes to the section `tabs` places on, and puts it down there. */
async function carry(handle: string, tabs: number) {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });
  screen.getByRole('button', { name: handle }).focus();
  await user.keyboard('{Enter}');
  act(() => void vi.runAllTimers());
  for (let tab = 0; tab < tabs; tab += 1) await user.tab();
  await user.keyboard('{Enter}');
  await act(async () => {
    vi.runAllTimers();
    await Promise.resolve();
  });
  vi.useRealTimers();
}

it('has a handle on each section, and moves a section picked up with the keyboard to the place of the one it is put down on', async () => {
  const onMove = vi.fn();
  render(<SectionList {...props({ onMove })} />);
  expect(screen.getAllByRole('button', { name: /^Drag section/ })).toHaveLength(3);
  await carry('Drag section 1', 2);
  expect(onMove).toHaveBeenCalledWith(0, 2);
});

it('moves a section up the same way', async () => {
  const onMove = vi.fn();
  render(<SectionList {...props({ onMove })} />);
  await carry('Drag section 3', 1);
  expect(onMove).toHaveBeenCalledWith(2, 0);
});

it('has no accessibility violations', async () => {
  const { container } = render(<SectionList {...props({ openIds: ['a'], description: 'What the page is made of, top to bottom.' })} />);
  await expectAccessible(container);
});
