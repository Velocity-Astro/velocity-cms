import type { Meta, StoryObj } from '@storybook/react-vite';
import { Meter } from './Meter.js';

const meta = {
  title: 'Components/Data/Meter',
  component: Meter,
  args: { label: 'November target', value: 13800, max: 20000, valueText: '69% of $20,000' },
} satisfies Meta<typeof Meter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Reached: Story = { args: { value: 24500, valueText: '123% of $20,000' } };
export const NothingYet: Story = { args: { value: 0, valueText: '0% of $20,000' } };
