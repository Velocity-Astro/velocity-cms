import type { Meta, StoryObj } from '@storybook/react-vite';
import { Plus } from 'lucide-react';
import { Button } from '../../components/Button/index.js';
import { PageHeader } from './PageHeader.js';

const meta = {
  title: 'Patterns/Page/PageHeader',
  component: PageHeader,
  parameters: { layout: 'padded' },
  args: { title: 'Listings' },
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TitleOnly: Story = {};
export const WithDescription: Story = { args: { description: 'Every property on the site.' } };
export const WithActions: Story = {
  args: {
    description: 'Every property on the site.',
    actions: (
      <>
        <Button variant="secondary">Import</Button>
        <Button icon={Plus}>New listing</Button>
      </>
    ),
  },
};
