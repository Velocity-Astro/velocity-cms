import type { Meta, StoryObj } from '@storybook/react-vite';
import { Upload } from 'lucide-react';
import { FileButton } from './FileButton.js';

const meta = {
  title: 'Components/Actions/FileButton',
  component: FileButton,
  args: { children: 'Upload a photo', accept: 'image', icon: Upload, onSelect: () => undefined },
} satisfies Meta<typeof FileButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Primary: Story = { args: { variant: 'primary' } };
export const Uploading: Story = { args: { isPending: true } };
