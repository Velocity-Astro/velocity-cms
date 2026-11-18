import type { Meta, StoryObj } from '@storybook/react-vite';
import { Thumbnail } from './Thumbnail.js';

/** A flat picture in one colour, so the stories need no files. */
const picture = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#8a9a5b"/></svg>')}`;

const meta = {
  title: 'Components/Data/Thumbnail',
  component: Thumbnail,
  args: { src: picture },
} satisfies Meta<typeof Thumbnail>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Small: Story = { args: { size: 'sm' } };
export const Large: Story = { args: { size: 'lg' } };
/** For a person's portrait. */
export const Circle: Story = { args: { size: 'sm', shape: 'circle' } };
/** No picture: the frame keeps its place. */
export const Empty: Story = { render: () => <Thumbnail /> };
