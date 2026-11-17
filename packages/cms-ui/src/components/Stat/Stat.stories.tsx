import type { Meta, StoryObj } from '@storybook/react-vite';
import { Stat } from './Stat.js';

const meta = {
  title: 'Components/Data/Stat',
  component: Stat,
  args: { label: 'Drafts', value: '3' },
} satisfies Meta<typeof Stat>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithDetail: Story = { args: { detail: 'Not on the site yet' } };
export const LargeFigure: Story = { args: { label: 'Published', value: '1,284' } };
