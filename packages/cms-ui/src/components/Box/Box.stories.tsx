import type { Meta, StoryObj } from '@storybook/react-vite';
import { Text } from '../Text/index.js';
import { Box } from './Box.js';

const meta = {
  title: 'Components/Layout/Box',
  component: Box,
  args: { padding: 6, children: <Text>Content</Text> },
} satisfies Meta<typeof Box>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {};
export const Card: Story = { args: { surface: 'card', border: true, radius: 'lg' } };
export const Subtle: Story = { args: { surface: 'subtle', radius: 'md' } };
export const Raised: Story = { args: { surface: 'card', border: true, radius: 'lg', shadow: 'md' } };
