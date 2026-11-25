import type { Meta, StoryObj } from '@storybook/react-vite';
import { TextField } from '../TextField/index.js';
import { PresenceMark } from './PresenceMark.js';

const meta = {
  title: 'Components/Feedback/PresenceMark',
  component: PresenceMark,
  args: { children: <TextField label="Title" defaultValue="Why list with us" /> },
} satisfies Meta<typeof PresenceMark>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const SomeoneThere: Story = { args: { label: 'Ana Ruiz is here' } };
