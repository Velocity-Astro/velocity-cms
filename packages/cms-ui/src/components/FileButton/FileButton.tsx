import type { LucideIcon } from 'lucide-react';
import { FileTrigger } from 'react-aria-components';
import { Button } from '../Button/index.js';
import { fileKinds, type FileKind } from './FileButton.variants.js';

export interface FileButtonProps {
  /** The words on the button, such as "Upload a photo". */
  readonly children: string;
  readonly icon?: LucideIcon;
  /** The kind of file the chooser offers. */
  readonly accept: FileKind;
  /** Called with the file the person picked from their computer. */
  readonly onSelect: (file: File) => void;
  /** The file is on its way: the button shows a spinner and ignores presses. */
  readonly isPending?: boolean;
  readonly variant?: 'primary' | 'secondary';
  readonly size?: 'sm' | 'md';
}

/** A button that opens the computer's file chooser and hands back the file that was picked. */
export function FileButton({ children, icon, accept, onSelect, isPending = false, variant = 'secondary', size = 'md' }: FileButtonProps) {
  return (
    <FileTrigger
      acceptedFileTypes={[...fileKinds[accept]]}
      onSelect={(files) => {
        const file = files?.[0];
        if (file) onSelect(file);
      }}
    >
      <Button variant={variant} size={size} isPending={isPending} {...(icon && { icon })}>
        {children}
      </Button>
    </FileTrigger>
  );
}
