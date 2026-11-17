import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileText, House, Image, Plus, Settings, Users } from 'lucide-react';
import { Box } from '../../components/Box/index.js';
import { Button } from '../../components/Button/index.js';
import { Stack } from '../../components/Stack/index.js';
import { Table } from '../../components/Table/index.js';
import { Tag } from '../../components/Tag/index.js';
import { Text } from '../../components/Text/index.js';
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
    brand: <Text weight="semibold">Lakeshore Realty</Text>,
    navLabel: 'Main',
    skipLabel: 'Skip to content',
    nav: [
      { id: 'listings', label: 'Listings', href: '#listings', icon: House, isCurrent: true },
      { id: 'pages', label: 'Pages', href: '#pages', icon: FileText },
      { id: 'media', label: 'Media', href: '#media', icon: Image },
      { id: 'people', label: 'People', href: '#people', icon: Users },
      { id: 'settings', label: 'Settings', href: '#settings', icon: Settings },
    ],
    footer: (
      <Text size="sm" tone="muted">
        Signed in as Dana
      </Text>
    ),
    children: screen,
  },
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithAScreen: Story = {};
