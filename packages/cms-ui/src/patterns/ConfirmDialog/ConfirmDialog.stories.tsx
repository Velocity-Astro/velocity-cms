import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button } from '../../components/Button/index.js';
import { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog.js';

/** A button that opens the dialog, as a screen would use it. */
function Example({ isOpen: startsOpen, ...props }: ConfirmDialogProps) {
  const [isOpen, setOpen] = useState(startsOpen);
  return (
    <>
      <Button variant="danger" onPress={() => setOpen(true)}>
        Delete listing
      </Button>
      <ConfirmDialog {...props} isOpen={isOpen} onOpenChange={setOpen} onConfirm={() => setOpen(false)} />
    </>
  );
}

const meta = {
  title: 'Patterns/Feedback/ConfirmDialog',
  component: ConfirmDialog,
  render: (args) => <Example {...args} />,
  args: {
    isOpen: false,
    onOpenChange: () => undefined,
    onConfirm: () => undefined,
    title: 'Delete 6214 Lakeshore Drive?',
    children: 'The listing is removed from the site at once. You can restore it from the trash for 30 days.',
    confirmLabel: 'Delete listing',
    cancelLabel: 'Cancel',
    tone: 'danger',
  },
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};
export const Open: Story = { tags: ['!autodocs', 'overlay'], args: { isOpen: true } };
export const NotDestructive: Story = {
  tags: ['!autodocs', 'overlay'],
  args: { isOpen: true, tone: 'default', title: 'Publish 12 listings?', children: 'They appear on the site at once.', confirmLabel: 'Publish all' },
};
export const Pending: Story = { tags: ['!autodocs', 'overlay'], args: { isOpen: true, isPending: true } };
