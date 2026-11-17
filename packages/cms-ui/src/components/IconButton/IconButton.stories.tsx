import type { Meta, StoryObj } from '@storybook/react-vite';
import { Ellipsis, X } from 'lucide-react';
import { IconButton } from './IconButton.js';

const meta = {
  title: 'Components/Actions/IconButton',
  component: IconButton,
  args: { label: 'More actions', icon: Ellipsis },
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ghost: Story = {};
export const Secondary: Story = { args: { variant: 'secondary' } };
export const Small: Story = { args: { size: 'sm', label: 'Close', icon: X } };
export const Disabled: Story = { args: { isDisabled: true } };
