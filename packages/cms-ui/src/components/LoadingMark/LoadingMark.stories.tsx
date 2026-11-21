import type { Meta, StoryObj } from '@storybook/react-vite';
import { LoadingMark } from './LoadingMark.js';

const meta = {
  title: 'Components/Status/LoadingMark',
  component: LoadingMark,
  parameters: { layout: 'fullscreen' },
  args: { label: 'Opening the editor' },
} satisfies Meta<typeof LoadingMark>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
