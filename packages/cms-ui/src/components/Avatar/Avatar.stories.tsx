import type { Meta, StoryObj } from '@storybook/react-vite';
import { Avatar } from './Avatar.js';

/** A flat picture in one colour, so the stories need no files. */
const photo = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#8a9a5b"/></svg>')}`;

const meta = {
  title: 'Components/Data/Avatar',
  component: Avatar,
  args: { name: 'Maya Ellison' },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No photo: the initials. */
export const Default: Story = {};
export const WithPhoto: Story = { args: { src: photo } };
export const Small: Story = { args: { size: 'sm' } };
export const Large: Story = { args: { size: 'lg', src: photo } };
