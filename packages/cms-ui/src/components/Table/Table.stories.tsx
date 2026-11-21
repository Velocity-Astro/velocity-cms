import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tag } from '../Tag/index.js';
import { Table } from './Table.js';

const meta = {
  title: 'Components/Data/Table',
  component: Table,
  parameters: { layout: 'padded' },
  args: {
    label: 'Listings',
    columns: [
      { id: 'title', label: 'Title', isSortable: true },
      { id: 'status', label: 'Status' },
      { id: 'updated', label: 'Updated', isSortable: true },
      { id: 'price', label: 'Price', align: 'end' },
    ],
    rows: [
      { id: '1', cells: { title: '6214 Lakeshore Drive', status: <Tag tone="success">Published</Tag>, updated: '2 hours ago', price: '$845,000' } },
      { id: '2', cells: { title: '18 Alder Court', status: <Tag>Draft</Tag>, updated: 'Yesterday', price: '$412,500' } },
      { id: '3', cells: { title: '907 Mesa Verde Lane', status: <Tag tone="warning">Unpublished changes</Tag>, updated: '3 days ago', price: '$1,290,000' } },
    ],
  },
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Sorted: Story = { args: { sort: { column: 'title', direction: 'ascending' } } };
export const RowsThatOpen: Story = { args: { onRowAction: () => undefined } };
export const AChosenRow: Story = { args: { selectedId: '2', onSelect: () => undefined, onRowAction: () => undefined } };
export const Empty: Story = { args: { rows: [], empty: 'No listings yet.' } };
