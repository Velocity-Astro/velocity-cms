import type { ReactNode } from 'react';
import { Button } from '../../components/Button/index.js';
import { Dialog } from '../../components/Dialog/index.js';
import { confirmButtonVariant } from './ConfirmDialog.variants.js';

export interface ConfirmDialogProps {
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  /** The question, naming the thing: "Delete 6214 Lakeshore Drive?" */
  readonly title: string;
  /** What will happen, and whether it can be undone. */
  readonly children: ReactNode;
  /** The action in a word or two: "Delete listing", not "Yes" or "OK". */
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly onConfirm: () => void;
  /** `danger` when confirming destroys something. */
  readonly tone?: 'default' | 'danger';
  /** The action is under way: the confirming button shows a spinner and the dialog stays open. */
  readonly isPending?: boolean;
}

/** Asks before doing something that is hard to undo. */
export function ConfirmDialog({
  isOpen,
  onOpenChange,
  title,
  children,
  confirmLabel,
  cancelLabel,
  onConfirm,
  tone = 'default',
  isPending = false,
}: ConfirmDialogProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={title}
      role="alertdialog"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onPress={() => onOpenChange(false)} isDisabled={isPending} autoFocus>
            {cancelLabel}
          </Button>
          <Button variant={confirmButtonVariant[tone]} onPress={onConfirm} isPending={isPending}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
