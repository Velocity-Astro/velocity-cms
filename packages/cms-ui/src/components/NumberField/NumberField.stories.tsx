import type { Meta, StoryObj } from '@storybook/react-vite';
import { NumberField } from './NumberField.js';

const meta = {
  title: 'Components/Forms/NumberField',
  component: NumberField,
  args: { label: 'Price' },
} satisfies Meta<typeof NumberField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const Filled: Story = { args: { defaultValue: 845000 } };
export const WithDescription: Story = { args: { defaultValue: 2.5, label: 'Bathrooms', description: 'Count a half bath as 0.5' } };
export const Invalid: Story = { args: { isRequired: true, errorMessage: 'Enter a price.' } };
export const Disabled: Story = { args: { defaultValue: 845000, isDisabled: true } };
