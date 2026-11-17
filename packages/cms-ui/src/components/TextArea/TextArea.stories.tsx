import type { Meta, StoryObj } from '@storybook/react-vite';
import { TextArea } from './TextArea.js';

const meta = {
  title: 'Components/Forms/TextArea',
  component: TextArea,
  args: { label: 'Summary', width: 'md' },
} satisfies Meta<typeof TextArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const Filled: Story = { args: { defaultValue: 'A bright three-bedroom home a short walk from the lake, with a new kitchen and a south-facing garden.' } };
export const WithDescription: Story = { args: { description: 'Shown in search results. Aim for one or two sentences.' } };
export const Invalid: Story = { args: { isRequired: true, errorMessage: 'Write a summary.' } };
export const Disabled: Story = { args: { defaultValue: 'A bright three-bedroom home.', isDisabled: true } };
export const Tall: Story = { args: { rows: 8 } };
