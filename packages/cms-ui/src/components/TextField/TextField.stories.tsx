import type { Meta, StoryObj } from '@storybook/react-vite';
import { TextField } from './TextField.js';

const meta = {
  title: 'Components/Forms/TextField',
  component: TextField,
  args: { label: 'Street', width: 'md' },
} satisfies Meta<typeof TextField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const Filled: Story = { args: { defaultValue: '6214 Lakeshore Drive' } };
export const WithDescription: Story = { args: { description: 'As it appears on the listing' } };
export const Required: Story = { args: { isRequired: true } };
export const WithPlaceholder: Story = { args: { label: 'Website', type: 'url', placeholder: 'https://example.com' } };
export const Invalid: Story = { args: { defaultValue: '', isRequired: true, errorMessage: 'Enter the street address.' } };
export const Disabled: Story = { args: { defaultValue: '6214 Lakeshore Drive', isDisabled: true } };
export const ReadOnly: Story = { args: { defaultValue: 'OH-20417', label: 'MLS number', isReadOnly: true } };
export const Narrow: Story = { args: { label: 'Postcode', width: 'sm', defaultValue: '75214' } };
