import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../Button/index.js';
import { Tooltip } from './Tooltip.js';

const meta = {
  title: 'Components/Overlays/Tooltip',
  component: Tooltip,
  args: { content: 'Saves without publishing', children: <Button variant="secondary">Save draft</Button> },
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OnHoverOrFocus: Story = {};
export const Below: Story = { args: { placement: 'bottom' } };
/** Focused, so the tooltip is showing. */
export const Showing: Story = {
  tags: ['!autodocs', 'overlay'],
  play: async ({ canvas }) => {
    canvas.getByRole('button').focus();
  },
};
