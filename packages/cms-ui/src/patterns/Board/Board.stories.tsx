import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Board, type BoardColumn } from './Board.js';

const columns: BoardColumn[] = [
  {
    id: 'new',
    title: 'New',
    count: '2',
    items: [
      { id: 'ana', title: 'Ana Ruiz', detail: 'ana@example.com', notes: [{ text: 'Dana' }, { text: 'Due today', tone: 'warning' }] },
      { id: 'tom', title: 'Tom Lee', detail: 'tom@example.com' },
    ],
  },
  { id: 'contacted', title: 'Contacted', count: '14', items: [{ id: 'li', title: 'Li Wei', detail: 'li@example.com', notes: [{ text: 'Overdue', tone: 'danger' }] }], more: '13 more' },
  { id: 'qualified', title: 'Qualified', count: '0', items: [] },
  { id: 'won', title: 'Won', count: '1', tone: 'success', items: [{ id: 'sam', title: 'sam@example.com' }] },
  { id: 'lost', title: 'Lost', count: '0', tone: 'danger', items: [] },
];

const meta = {
  title: 'Patterns/Data/Board',
  component: Board,
  args: {
    label: 'Pipeline',
    columns,
    emptyText: 'Nobody here',
    onOpen: () => {},
    onMove: () => {},
    moveLabel: (title: string) => `Move ${title}`,
  },
} satisfies Meta<typeof Board>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Working: Story = {
  render: function Pipeline(args) {
    const [placed, setPlaced] = useState(columns);
    return (
      <Board
        {...args}
        columns={placed}
        onMove={(id, columnId) => {
          const moved = placed.flatMap((column) => column.items).find((item) => item.id === id);
          if (!moved) return;
          setPlaced(
            placed.map((column) => {
              const items = column.id === columnId ? [moved, ...column.items] : column.items.filter((item) => item.id !== id);
              return { ...column, items, count: String(items.length) };
            }),
          );
        }}
      />
    );
  },
};

export const Empty: Story = { args: { columns: columns.map(({ more: _more, ...column }) => ({ ...column, items: [], count: '0' })) } };
