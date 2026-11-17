import type { Meta, StoryObj } from '@storybook/react-vite';
import { Copy, Ellipsis, EyeOff, Trash2 } from 'lucide-react';
import { Button } from '../Button/index.js';
import { IconButton } from '../IconButton/index.js';
import { Menu } from './Menu.js';

const meta = {
  title: 'Components/Overlays/Menu',
  component: Menu,
  args: {
    trigger: <IconButton label="More actions" icon={Ellipsis} />,
    onAction: () => undefined,
    actions: [
      { id: 'duplicate', label: 'Duplicate', icon: Copy },
      { id: 'unpublish', label: 'Unpublish', icon: EyeOff, isDisabled: true },
      { id: 'delete', label: 'Delete', icon: Trash2, tone: 'danger' },
    ],
  },
} satisfies Meta<typeof Menu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FromAnIconButton: Story = {};
export const FromAButton: Story = { args: { trigger: <Button variant="secondary">Actions</Button>, placement: 'bottom start' } };
/** Pressed, so the menu is showing. */
export const Open: Story = {
  tags: ['!autodocs', 'overlay'],
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button'));
  },
};
