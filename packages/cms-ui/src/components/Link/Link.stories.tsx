import type { Meta, StoryObj } from '@storybook/react-vite';
import { Link } from './Link.js';

const meta = {
  title: 'Components/Actions/Link',
  component: Link,
  args: { href: '#listing', children: '6214 Lakeshore Drive' },
} satisfies Meta<typeof Link>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Muted: Story = { args: { tone: 'muted', children: 'View on site' } };
export const NewTab: Story = { args: { opensInNewTab: true, children: 'View on site' } };
export const Disabled: Story = { args: { isDisabled: true } };
