import type { Meta, StoryObj } from '@storybook/react-vite';
import { House, Plus, SearchX } from 'lucide-react';
import { Button } from '../../components/Button/index.js';
import { EmptyState } from './EmptyState.js';

const meta = {
  title: 'Patterns/Page/EmptyState',
  component: EmptyState,
  args: { title: 'No listings yet' },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FirstUse: Story = {
  args: {
    icon: House,
    description: 'Listings you add appear on the site as soon as you publish them.',
    action: <Button icon={Plus}>New listing</Button>,
  },
};
export const NoResults: Story = {
  args: {
    icon: SearchX,
    title: 'No listings match "lakeshore"',
    description: 'Check the spelling, or clear the search to see every listing.',
    action: <Button variant="secondary">Clear search</Button>,
  },
};
export const TitleOnly: Story = { args: { title: 'No history yet' } };
