import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog.js';

const example = (props: Partial<ConfirmDialogProps> = {}) => (
  <ConfirmDialog
    isOpen
    onOpenChange={() => undefined}
    title="Delete Lakeshore Drive?"
    confirmLabel="Delete listing"
    cancelLabel="Cancel"
    onConfirm={() => undefined}
    tone="danger"
    {...props}
  >
    It is removed from the site at once.
  </ConfirmDialog>
);

it('interrupts with the question and what will happen', () => {
  render(example());
  const dialog = screen.getByRole('alertdialog', { name: 'Delete Lakeshore Drive?' });
  expect(dialog.textContent).toContain('It is removed from the site at once.');
});

it('starts on Cancel, so Enter never destroys anything by accident', async () => {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  const user = userEvent.setup();
  render(example({ onConfirm, onOpenChange }));
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
  await user.keyboard('{Enter}');
  expect(onConfirm).not.toHaveBeenCalled();
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it('confirms on its action button and cancels on Escape', async () => {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  const user = userEvent.setup();
  render(example({ onConfirm, onOpenChange }));
  await user.click(screen.getByRole('button', { name: 'Delete listing' }));
  expect(onConfirm).toHaveBeenCalledOnce();
  await user.keyboard('{Escape}');
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
});

it('cannot be cancelled or confirmed twice while the action is under way', async () => {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();
  const user = userEvent.setup();
  render(example({ onConfirm, onOpenChange, isPending: true }));
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await user.click(screen.getByRole('button', { name: /Delete listing/ }));
  expect(onConfirm).not.toHaveBeenCalled();
  expect(onOpenChange).not.toHaveBeenCalled();
});

it('has no accessibility violations', async () => {
  render(example());
  await expectAccessible(document.body);
});
