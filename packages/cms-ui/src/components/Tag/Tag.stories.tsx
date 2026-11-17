import type { Meta, StoryObj } from '@storybook/react-vite';
import { Check } from 'lucide-react';
import { Tag } from './Tag.js';

const meta = {
  title: 'Components/Status/Tag',
  component: Tag,
  args: { children: 'For sale' },
} satisfies Meta<typeof Tag>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = {};
export const Success: Story = { args: { tone: 'success', children: 'Published' } };
export const Warning: Story = { args: { tone: 'warning', children: 'Unpublished changes' } };
export const Danger: Story = { args: { tone: 'danger', children: 'Failed' } };
export const Info: Story = { args: { tone: 'info', children: 'Scheduled' } };
export const WithIcon: Story = { args: { tone: 'success', icon: Check, children: 'Published' } };
