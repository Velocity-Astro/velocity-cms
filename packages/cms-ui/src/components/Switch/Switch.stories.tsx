import type { Meta, StoryObj } from '@storybook/react-vite';
import { Switch } from './Switch.js';

const meta = {
  title: 'Components/Forms/Switch',
  component: Switch,
  args: { label: 'Show on homepage' },
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {};
export const On: Story = { args: { defaultSelected: true } };
export const Disabled: Story = { args: { isDisabled: true } };
export const DisabledOn: Story = { args: { isDisabled: true, defaultSelected: true } };
export const LabelHidden: Story = { args: { label: 'SEO is active', isLabelHidden: true, defaultSelected: true } };
