import { act, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Toast, dismissToasts, toast } from './Toast.js';

const open: (() => void)[] = [];
const show = (...args: Parameters<typeof toast>) => act(() => void open.push(toast(...args)));
afterEach(() => act(() => open.splice(0).forEach((close) => close())));

it('shows nothing until a message is sent', () => {
  render(<Toast label="Notifications" closeLabel="Dismiss" />);
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

it('shows a message with its title and description, in a named region', () => {
  render(<Toast label="Notifications" closeLabel="Dismiss" />);
  show({ title: 'Listing published', description: 'It is on the site now.', tone: 'success' });
  const message = within(screen.getByRole('region', { name: /Notifications/ })).getByRole('alertdialog', { name: 'Listing published' });
  expect(message.textContent).toContain('It is on the site now.');
});

it('is dismissed by its close button', async () => {
  const user = userEvent.setup();
  render(<Toast label="Notifications" closeLabel="Dismiss" />);
  show({ title: 'Link copied' });
  await user.click(screen.getByRole('button', { name: 'Dismiss' }));
  expect(screen.queryByText('Link copied')).toBeNull();
});

it('can be taken away by whoever sent it', () => {
  render(<Toast label="Notifications" closeLabel="Dismiss" />);
  let close: () => void = () => undefined;
  act(() => void (close = toast({ title: 'Saving' })));
  expect(screen.getByText('Saving')).toBeTruthy();
  act(() => close());
  expect(screen.queryByText('Saving')).toBeNull();
});

it('has no accessibility violations while showing', async () => {
  render(<Toast label="Notifications" closeLabel="Dismiss" />);
  show({ title: 'Could not save', description: 'Try again.', tone: 'danger' });
  await expectAccessible(document.body);
});

it('closes every message at once when asked', async () => {
  render(<Toast label="Notifications" closeLabel="Dismiss" />);
  show({ title: 'Saved' });
  show({ title: 'Could not publish', tone: 'danger' });
  expect(await screen.findByText('Could not publish')).toBeTruthy();
  act(() => dismissToasts());
  expect(screen.queryByText('Saved')).toBeNull();
  expect(screen.queryByText('Could not publish')).toBeNull();
});
