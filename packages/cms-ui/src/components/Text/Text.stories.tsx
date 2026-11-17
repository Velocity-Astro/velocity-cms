import type { Meta, StoryObj } from '@storybook/react-vite';
import { Text } from './Text.js';

const meta = {
  title: 'Components/Typography/Text',
  component: Text,
  args: { children: 'Four bedrooms on Lakeshore Drive, five minutes from the lake trail.' },
} satisfies Meta<typeof Text>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Small: Story = { args: { size: 'sm' } };
export const Large: Story = { args: { size: 'lg' } };
export const Secondary: Story = { args: { tone: 'secondary' } };
export const Muted: Story = { args: { tone: 'muted' } };
export const Danger: Story = { args: { tone: 'danger', children: 'This listing could not be saved.' } };
export const Success: Story = { args: { tone: 'success', children: 'Published.' } };
export const Semibold: Story = { args: { weight: 'semibold' } };
export const Mono: Story = { args: { mono: true, children: '/listings/lakeshore-farmhouse' } };
export const Truncated: Story = { args: { truncate: true }, parameters: { layout: 'padded' } };
