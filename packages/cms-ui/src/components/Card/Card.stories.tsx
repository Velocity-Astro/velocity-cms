import type { Meta, StoryObj } from '@storybook/react-vite';
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
