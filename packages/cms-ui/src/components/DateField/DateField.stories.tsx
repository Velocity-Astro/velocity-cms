import type { Meta, StoryObj } from '@storybook/react-vite';
import { DateField } from './DateField.js';

const meta = {
  title: 'Components/Forms/DateField',
  component: DateField,
  args: { label: 'Listed on' },
} satisfies Meta<typeof DateField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const Filled: Story = { args: { defaultValue: '2026-11-17' } };
export const WithDescription: Story = { args: { defaultValue: '2026-11-17', description: 'Shown on the listing' } };
export const Invalid: Story = { args: { isRequired: true, errorMessage: 'Enter the date it was listed.' } };
export const Disabled: Story = { args: { defaultValue: '2026-11-17', isDisabled: true } };
