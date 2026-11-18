import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../Button/index.js';
import { Switch } from '../Switch/index.js';
import { Tag } from '../Tag/index.js';
import { Text } from '../Text/index.js';
import { TextField } from '../TextField/index.js';
import { Card } from './Card.js';

const meta = {
  title: 'Components/Layout/Card',
  component: Card,
  args: {
    title: 'Address',
    children: (
      <>
        <TextField label="Street" defaultValue="6214 Lakeshore Drive" />
        <TextField label="City" defaultValue="Dallas" />
      </>
    ),
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithDescription: Story = { args: { description: 'Shown on the listing and used to place the pin on the map.' } };
export const WithoutTitle: Story = { args: { children: <TextField label="Street" defaultValue="6214 Lakeshore Drive" /> }, render: ({ children }) => <Card>{children}</Card> };
export const WithActionsAndFooter: Story = {
  args: {
    title: 'SEO',
    description: 'Titles and descriptions for search engines.',
    actions: (
      <>
        <Tag tone="success">Active</Tag>
        <Switch label="SEO is active" isLabelHidden defaultSelected />
      </>
    ),
    footer: (
      <Button variant="secondary" size="sm">
        Settings
      </Button>
    ),
    children: (
      <Text size="sm" tone="muted">
        Version 1.1.0
      </Text>
    ),
  },
};
