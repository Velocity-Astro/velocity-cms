import { X } from 'lucide-react';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Dialog as AriaDialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { IconButton } from '../IconButton/index.js';
import {
  dialogBodyClass,
  dialogContentVariants,
  dialogFooterClass,
  dialogHeaderClass,
  dialogOverlayVariants,
  dialogTitleClass,
  dialogVariants,
  type DialogVariants,
} from './Dialog.variants.js';

export interface DialogProps extends DialogVariants {
  readonly isOpen: boolean;
  /** Called when the dialog asks to close: Escape, a press outside, or its close button. */
  readonly onOpenChange: (isOpen: boolean) => void;
  /** Called once the dialog has closed and finished leaving the page. The moment to forget what it showed. */
  readonly onClosed?: () => void;
  /** Names the dialog for everyone. */
  readonly title: string;
  readonly children: ReactNode;
  /** The dialog's buttons, main action last. */
  readonly footer?: ReactNode;
  /** The name of the close button, such as "Close". Leave out to have no close button. */
  readonly closeLabel?: string;
  /** `alertdialog` interrupts with something that needs an answer, and cannot be dismissed by pressing outside. */
  readonly role?: 'dialog' | 'alertdialog';
}

/** A window over the page that must be dealt with before going back to it. */
export function Dialog({
  isOpen,
  onOpenChange,
  onClosed,
  title,
  children,
  footer,
  closeLabel,
  role = 'dialog',
  size,
  placement,
}: DialogProps) {
  // React Aria keeps the dialog on the page until it has finished leaving. When its element
  // goes while the dialog is closed, it has left.
  const latest = useRef({ isOpen, onClosed });
  useEffect(() => {
    latest.current = { isOpen, onClosed };
  });
  const left = useCallback(
    () => () => {
      if (!latest.current.isOpen) latest.current.onClosed?.();
    },
    [],
  );
  return (
    <ModalOverlay
      ref={left}
      className={dialogOverlayVariants({ placement })}
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      isDismissable={role === 'dialog'}
    >
      <Modal className={dialogVariants({ size, placement })}>
        <AriaDialog className={dialogContentVariants({ placement })} role={role}>
          {({ close }) => (
            <>
              <div className={dialogHeaderClass}>
                <Heading slot="title" className={dialogTitleClass}>
                  {title}
                </Heading>
                {closeLabel !== undefined && <IconButton label={closeLabel} icon={X} size="sm" onPress={close} />}
              </div>
              <div className={dialogBodyClass}>{children}</div>
              {footer !== undefined && <div className={dialogFooterClass}>{footer}</div>}
            </>
          )}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
}
