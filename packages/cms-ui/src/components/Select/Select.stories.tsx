import type { Meta, StoryObj } from '@storybook/react-vite';
import { Select } from './Select.js';

const options = [
  { id: 'for-sale', label: 'For sale' },
  { id: 'under-offer', label: 'Under offer' },
  { id: 'sold', label: 'Sold' },
  { id: 'withdrawn', label: 'Withdrawn' },
];

const meta = {
  title: 'Components/Forms/Select',
  component: Select,
  args: { label: 'Status', options, width: 'md', placeholder: 'Choose a status' },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const Chosen: Story = { args: { defaultValue: 'under-offer' } };
export const WithDescription: Story = { args: { description: 'Shown on the listing as a badge' } };
export const Required: Story = { args: { isRequired: true } };
export const Invalid: Story = { args: { isRequired: true, errorMessage: 'Choose a status.' } };
export const Disabled: Story = { args: { defaultValue: 'sold', isDisabled: true } };
/** Pressed, so the list is showing. */
export const Open: Story = {
  tags: ['!autodocs', 'overlay'],
  args: { defaultValue: 'under-offer' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button'));
  },
};
