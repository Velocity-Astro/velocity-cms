import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button } from '../Button/index.js';
import { TextField } from '../TextField/index.js';
import { Dialog, type DialogProps } from './Dialog.js';

/** A button that opens the dialog, as a screen would use it. */
function Example({ isOpen: startsOpen, ...props }: DialogProps) {
  const [isOpen, setOpen] = useState(startsOpen);
  return (
    <>
      <Button variant="secondary" onPress={() => setOpen(true)}>
        Rename listing
      </Button>
      <Dialog
        {...props}
        isOpen={isOpen}
        onOpenChange={setOpen}
        footer={
          <>
            <Button variant="secondary" onPress={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onPress={() => setOpen(false)}>Rename</Button>
          </>
        }
      />
    </>
  );
}

const meta = {
  title: 'Components/Overlays/Dialog',
  component: Dialog,
  render: (args) => <Example {...args} />,
  args: {
    isOpen: false,
    onOpenChange: () => undefined,
    title: 'Rename listing',
    closeLabel: 'Close',
    children: <TextField label="Title" defaultValue="6214 Lakeshore Drive" />,
  },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};
export const Open: Story = { tags: ['!autodocs', 'overlay'], args: { isOpen: true } };
export const Small: Story = { tags: ['!autodocs', 'overlay'], args: { isOpen: true, size: 'sm' } };
