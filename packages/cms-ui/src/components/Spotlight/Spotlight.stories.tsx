import type { Meta, StoryObj } from '@storybook/react-vite';
import { TextField } from '../TextField/index.js';
import { Spotlight } from './Spotlight.js';

const meta = {
  title: 'Components/Feedback/Spotlight',
  component: Spotlight,
  args: { children: <TextField label="Title" defaultValue="Why list with us" /> },
} satisfies Meta<typeof Spotlight>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const PointedAt: Story = { args: { at: 1 } };
