import type { Meta, StoryObj } from '@storybook/react-vite';
import { TextField } from '../TextField/index.js';
import { Fieldset } from './Fieldset.js';

const meta = {
  title: 'Components/Forms/Fieldset',
  component: Fieldset,
  args: {
    legend: 'Address',
    children: (
      <>
        <TextField label="Street" defaultValue="6214 Lakeshore Drive" />
        <TextField label="City" defaultValue="Austin" />
      </>
    ),
  },
} satisfies Meta<typeof Fieldset>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithDescription: Story = { args: { description: 'Shown on the listing and used for the map.' } };
export const Empty: Story = { args: { legend: 'Gallery', description: 'This kind of field cannot be edited here yet.', children: null } };
