import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../../components/Button/index.js';
import { Tag } from '../../components/Tag/index.js';
import { Text } from '../../components/Text/index.js';
import { SaveBar } from './SaveBar.js';

const meta = {
  title: 'Patterns/Forms/SaveBar',
  component: SaveBar,
  parameters: { layout: 'padded' },
  args: {
    label: 'Save and publish',
    back: { href: '#listings', label: 'Listings' },
    title: 'Updated 1948 bungalow facing the green',
    status: (
      <>
        <Tag tone="warning">Unpublished changes</Tag>
        <Text as="span" size="sm" tone="muted">
          Saved 2 minutes ago
        </Text>
      </>
    ),
    actions: (
      <>
        <Button variant="secondary">Save draft</Button>
        <Button>Publish</Button>
      </>
    ),
  },
} satisfies Meta<typeof SaveBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UnpublishedChanges: Story = {};
export const Published: Story = {
  args: {
    status: (
      <>
        <Tag tone="success">Published</Tag>
        <Text as="span" size="sm" tone="muted">
          No changes since publishing
        </Text>
      </>
    ),
    actions: <Button isDisabled>Publish</Button>,
  },
};
export const Saving: Story = {
  args: {
    status: (
      <Text as="span" size="sm" tone="muted">
        Saving
      </Text>
    ),
    actions: (
      <>
        <Button variant="secondary" isPending>
          Save draft
        </Button>
        <Button isDisabled>Publish</Button>
      </>
    ),
  },
};
