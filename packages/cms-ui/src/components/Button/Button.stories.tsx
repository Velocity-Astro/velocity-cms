import type { Meta, StoryObj } from '@storybook/react-vite';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from './Button.js';

const meta = {
  title: 'Components/Actions/Button',
  component: Button,
  args: { children: 'Publish' },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};
export const Secondary: Story = { args: { variant: 'secondary', children: 'Save draft' } };
export const Ghost: Story = { args: { variant: 'ghost', children: 'Cancel' } };
export const Danger: Story = { args: { variant: 'danger', icon: Trash2, children: 'Delete listing' } };
export const Brand: Story = { args: { variant: 'brand', children: 'Publish changes' } };
export const Small: Story = { args: { size: 'sm' } };
export const WithIcon: Story = { args: { icon: Plus, children: 'New listing' } };
export const Disabled: Story = { args: { isDisabled: true } };
export const Pending: Story = { args: { isPending: true, children: 'Publishing' } };
export const FullWidth: Story = { args: { fullWidth: true }, parameters: { layout: 'padded' } };
