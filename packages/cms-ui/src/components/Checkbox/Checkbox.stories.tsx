import type { Meta, StoryObj } from '@storybook/react-vite';
import { Checkbox } from './Checkbox.js';

const meta = {
  title: 'Components/Forms/Checkbox',
  component: Checkbox,
  args: { label: 'Featured listing' },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {};
export const On: Story = { args: { defaultSelected: true } };
export const Indeterminate: Story = { args: { label: 'Select all', isIndeterminate: true } };
export const Disabled: Story = { args: { isDisabled: true } };
export const DisabledOn: Story = { args: { isDisabled: true, defaultSelected: true } };
