import { X } from 'lucide-react';
import type { ReactNode } from 'react';
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
  title,
  children,
  footer,
  closeLabel,
  role = 'dialog',
  size,
  placement,
}: DialogProps) {
  return (
    <ModalOverlay
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
