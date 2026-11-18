import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { OptionPicker, type OptionPickerProps } from './OptionPicker.js';

const groups = [
  { id: 'content', label: 'Content', options: [{ id: 'text', label: 'Text', description: 'Paragraphs and lists.' }, { id: 'image', label: 'Picture' }] },
  { id: 'action', label: 'Action', options: [{ id: 'cta', label: 'Call to action', description: 'One line and a button.' }] },
  { id: 'empty', label: 'Nothing here', options: [] },
];

const example = (props: Partial<OptionPickerProps> = {}) => (
  <OptionPicker
    isOpen
    onOpenChange={() => undefined}
    title="Add a section"
    closeLabel="Close"
    groups={groups}
    onChoose={() => undefined}
    emptyText="No kinds of section yet."
    {...props}
  />
);

it('shows the options under the name of their group, and leaves out a group with none', () => {
  render(example());
  const dialog = screen.getByRole('dialog', { name: 'Add a section' });
  const content = within(dialog).getByRole('group', { name: 'Content' });
  expect(within(content).getAllByRole('option').map((option) => option.textContent)).toEqual(['TextParagraphs and lists.', 'Picture']);
  expect(within(dialog).getByRole('group', { name: 'Action' })).toBeTruthy();
  expect(within(dialog).queryByText('Nothing here')).toBeNull();
});

it('names an option by everything it shows, so what is read out is what is seen', () => {
  render(example());
  expect(screen.getByRole('option', { name: /^Call to action ?One line and a button\.$/ })).toBeTruthy();
});

it('chooses with a press and asks to close', async () => {
  const onChoose = vi.fn();
  const onOpenChange = vi.fn();
  const user = userEvent.setup();
  render(example({ onChoose, onOpenChange }));
  await user.click(screen.getByRole('option', { name: 'Picture' }));
  expect(onChoose).toHaveBeenCalledWith('image');
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it('chooses with the keyboard, starting on the first option', async () => {
  const onChoose = vi.fn();
  const user = userEvent.setup();
  render(example({ onChoose }));
  await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
  expect(onChoose).toHaveBeenCalledWith('cta');
});

it('closes on Escape and on its close button without choosing', async () => {
  const onChoose = vi.fn();
  const onOpenChange = vi.fn();
  const user = userEvent.setup();
  render(example({ onChoose, onOpenChange }));
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('button', { name: 'Close' }));
  expect(onOpenChange).toHaveBeenCalledTimes(2);
  expect(onChoose).not.toHaveBeenCalled();
});

it('says so when there is nothing to choose from', () => {
  render(example({ groups: [] }));
  expect(screen.getByText('No kinds of section yet.')).toBeTruthy();
  expect(screen.queryByRole('listbox')).toBeNull();
});

it('has no accessibility violations', async () => {
  render(example());
  await expectAccessible(document.body);
});
