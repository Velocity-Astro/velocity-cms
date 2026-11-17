import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileText, House, Image, LogOut, MapPin, Plus, Settings, Users } from 'lucide-react';
import { Box } from '../../components/Box/index.js';
import { Button } from '../../components/Button/index.js';
import { Logo } from '../../components/Logo/index.js';
import { Stack } from '../../components/Stack/index.js';
import { Table } from '../../components/Table/index.js';
import { Tag } from '../../components/Tag/index.js';
import { PageHeader } from '../PageHeader/index.js';
import { AppShell } from './AppShell.js';

const screen = (
  <Box padding={8}>
    <Stack gap={6}>
      <PageHeader title="Listings" description="Every property on the site." actions={<Button icon={Plus}>New listing</Button>} />
      <Table
        label="Listings"
        columns={[
          { id: 'title', label: 'Title' },
          { id: 'status', label: 'Status' },
          { id: 'price', label: 'Price', align: 'end' },
        ]}
        rows={[
          { id: '1', cells: { title: '6214 Lakeshore Drive', status: <Tag tone="success">Published</Tag>, price: '$845,000' } },
          { id: '2', cells: { title: '18 Alder Court', status: <Tag>Draft</Tag>, price: '$412,500' } },
        ]}
      />
    </Stack>
  </Box>
);

const meta = {
  title: 'Patterns/Page/AppShell',
  component: AppShell,
  parameters: { layout: 'fullscreen' },
  args: {
    logo: <Logo label="Velocity" />,
    siteName: 'Lakeshore Realty',
    siteDetail: 'Real estate template',
    navLabel: 'Main',
    skipLabel: 'Skip to content',
    nav: [
      { id: 'top', items: [{ id: 'home', label: 'Home', href: '#home', icon: House }] },
      {
        id: 'content',
        label: 'Content',
        items: [
          { id: 'listings', label: 'Listings', href: '#listings', icon: FileText, isCurrent: true },
          { id: 'neighborhoods', label: 'Neighborhoods', href: '#neighborhoods', icon: MapPin },
        ],
      },
      {
        id: 'site',
        label: 'Site',
        items: [
          { id: 'media', label: 'Media', href: '#media', icon: Image },
          { id: 'team', label: 'Team', href: '#team', icon: Users },
          { id: 'settings', label: 'Settings', href: '#settings', icon: Settings },
        ],
      },
    ],
    account: {
      name: 'Dana Whitfield',
      detail: 'Owner',
      label: 'Account',
      actions: [{ id: 'sign-out', label: 'Sign out', icon: LogOut }],
      onAction: () => undefined,
    },
    children: screen,
  },
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithAScreen: Story = {};
