import type { Meta, StoryObj } from '@storybook/react-vite';
import { SiteWindow } from './SiteWindow.js';

const meta = {
  title: 'Patterns/Page/SiteWindow',
  component: SiteWindow,
  args: {
    address: 'lakeshore.example',
    src: 'about:blank',
    title: 'The home page of Lakeshore Realty',
    label: 'Edit the home page',
    meta: 'Published 3 days ago',
    onPress: () => undefined,
  },
} satisfies Meta<typeof SiteWindow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const ToTheSite: Story = { args: { meta: 'Not published yet', label: 'Open the site' } };
