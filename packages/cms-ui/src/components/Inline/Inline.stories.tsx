import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tag } from '../Tag/index.js';
import { Inline } from './Inline.js';

const meta = {
  title: 'Components/Layout/Inline',
  component: Inline,
  args: {
    children: [<Tag key="a">For sale</Tag>, <Tag key="b" tone="success">Published</Tag>, <Tag key="c" tone="warning">Draft</Tag>],
  },
} satisfies Meta<typeof Inline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const SpaceBetween: Story = { args: { justify: 'between' } };
export const Wrapping: Story = { args: { wrap: true, gap: 4 } };
