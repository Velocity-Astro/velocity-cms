import type { Meta, StoryObj } from '@storybook/react-vite';
import { Text } from '../Text/index.js';
import { Tabs } from './Tabs.js';

const meta = {
  title: 'Components/Navigation/Tabs',
  component: Tabs,
  args: {
    label: 'Listing sections',
    tabs: [
      { id: 'content', label: 'Content', content: <Text>The fields of the listing.</Text> },
      { id: 'seo', label: 'SEO', content: <Text>How the listing appears in search results.</Text> },
      { id: 'history', label: 'History', content: <Text>Every saved version.</Text> },
    ],
  },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const First: Story = {};
export const SecondSelected: Story = { args: { defaultSelected: 'seo' } };
export const WithADisabledTab: Story = {
  args: {
    tabs: [
      { id: 'content', label: 'Content', content: <Text>The fields of the listing.</Text> },
      { id: 'history', label: 'History', content: <Text>Every saved version.</Text>, isDisabled: true },
    ],
  },
};
