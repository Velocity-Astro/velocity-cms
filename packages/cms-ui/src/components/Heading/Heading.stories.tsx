import type { Meta, StoryObj } from '@storybook/react-vite';
import { Heading } from './Heading.js';

const meta = {
  title: 'Components/Typography/Heading',
  component: Heading,
  args: { level: 1, children: 'Lakeshore Farmhouse' },
} satisfies Meta<typeof Heading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Level1: Story = {};
export const Level2: Story = { args: { level: 2 } };
export const Level3: Story = { args: { level: 3 } };
export const Level4: Story = { args: { level: 4 } };
export const SmallLevel2: Story = { args: { level: 2, size: 'sm' } };
