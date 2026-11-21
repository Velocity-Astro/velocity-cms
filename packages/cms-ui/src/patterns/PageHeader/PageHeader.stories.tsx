import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileUp, ListPlus, Plus } from 'lucide-react';
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

/** On a phone the other actions fold into one menu and the main button is its icon alone. */
export const WithOtherActions: Story = {
  args: {
    description: 'Everyone who wrote to you through a form.',
    secondary: {
      moreLabel: 'More actions',
      actions: [
        { id: 'fields', label: 'Custom fields', icon: ListPlus, onPress: () => {} },
        { id: 'import', label: 'Import', icon: FileUp, onPress: () => {} },
      ],
    },
    actions: (
      <Button icon={Plus} collapses>
        New contact
      </Button>
    ),
  },
};
