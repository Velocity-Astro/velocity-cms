import type { Meta, StoryObj } from '@storybook/react-vite';
import { Logo } from './Logo.js';

const meta = {
  title: 'Components/Brand/Logo',
  component: Logo,
  args: { label: 'Velocity' },
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Small: Story = { args: { size: 'sm' } };
export const Large: Story = { args: { size: 'lg' } };
