import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Button } from '../Button/index.js';
import { Dialog } from './Dialog.js';

it('renders nothing while closed', () => {
  render(
    <Dialog isOpen={false} onOpenChange={() => undefined} title="Rename listing">
      Body
    </Dialog>,
  );
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('is a dialog named by its title, holding its body and buttons', () => {
  render(
    <Dialog isOpen onOpenChange={() => undefined} title="Rename listing" footer={<Button>Rename</Button>}>
      Body
    </Dialog>,
  );
  const dialog = screen.getByRole('dialog', { name: 'Rename listing' });
  expect(dialog.textContent).toContain('Body');
  expect(within(dialog).getByRole('button', { name: 'Rename' })).toBeTruthy();
});

it('moves focus inside and asks to close on Escape and on its close button', async () => {
  const onOpenChange = vi.fn();
  const user = userEvent.setup();
  render(
    <Dialog isOpen onOpenChange={onOpenChange} title="Rename listing" closeLabel="Close">
      Body
    </Dialog>,
  );
  expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  await user.keyboard('{Escape}');
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
  await user.click(screen.getByRole('button', { name: 'Close' }));
  expect(onOpenChange).toHaveBeenCalledTimes(2);
});

it('says when it has closed and left the page', async () => {
  const onClosed = vi.fn();
  function Example() {
    const [isOpen, setOpen] = useState(true);
    return (
      <Dialog isOpen={isOpen} onOpenChange={setOpen} onClosed={onClosed} title="Rename listing" closeLabel="Close">
        Body
      </Dialog>
    );
  }
  const user = userEvent.setup();
  render(<Example />);
  expect(onClosed).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(onClosed).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('has no close button unless it is given a name', () => {
  render(
    <Dialog isOpen onOpenChange={() => undefined} title="Delete listing?" role="alertdialog">
      Body
    </Dialog>,
  );
  expect(within(screen.getByRole('alertdialog')).queryByRole('button')).toBeNull();
});

it('can be drawn as a panel down the side', () => {
  render(
    <Dialog isOpen onOpenChange={() => undefined} title="Edit image" placement="side">
      Body
    </Dialog>,
  );
  expect(screen.getByRole('dialog', { name: 'Edit image' }).className).toContain('h-full');
});

it('has no accessibility violations while open', async () => {
  render(
    <Dialog isOpen onOpenChange={() => undefined} title="Rename listing" closeLabel="Close" footer={<Button>Rename</Button>}>
      Body
    </Dialog>,
  );
  await expectAccessible(document.body);
});
