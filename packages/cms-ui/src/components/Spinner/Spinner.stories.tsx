import type { Meta, StoryObj } from '@storybook/react-vite';
import { Spinner } from './Spinner.js';

const meta = {
  title: 'Components/Status/Spinner',
  component: Spinner,
  args: { label: 'Loading listings' },
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithLabel: Story = { args: { showLabel: true } };
export const Small: Story = { args: { size: 'sm', showLabel: true } };
