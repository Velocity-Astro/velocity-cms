import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import { ColorPicker } from './ColorPicker.js';

const meta = {
  title: 'Components/Forms/ColorPicker',
  component: ColorPicker,
  args: {
    label: 'Brand colour',
    pickLabel: 'Choose a colour',
    hueLabel: 'Hue',
    width: 'md',
    onChange: () => {},
  },
} satisfies Meta<typeof ColorPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const Chosen: Story = { args: { value: '#1f3a5f' } };
export const WithDescription: Story = { args: { value: '#c2410c', description: 'Buttons, links and highlights on every page.' } };
export const Invalid: Story = { args: { isRequired: true, errorMessage: 'Type a hex colour, such as #1f3a5f.' } };
/** Pressed, so the colour area, the hues and the suggested colours are showing. */
export const Open: Story = {
  tags: ['!autodocs', 'overlay'],
  args: {
    value: '#1f3a5f',
    presets: ['#1f3a5f', '#c2410c', '#15803d', '#7c3aed', '#0f766e', '#111827'],
    presetsLabel: 'Suggested colours',
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Choose a colour' }));
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
  },
};
