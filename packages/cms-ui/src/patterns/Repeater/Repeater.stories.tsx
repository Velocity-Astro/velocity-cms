import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { TextField } from '../../components/TextField/index.js';
import { Repeater } from './Repeater.js';

const meta = {
  title: 'Patterns/Forms/Repeater',
  component: Repeater,
  args: {
    label: 'Highlights',
    items: [],
    emptyText: 'No highlights yet',
    addLabel: 'Add highlight',
    onAdd: () => {},
    onRemove: () => {},
    onMove: () => {},
    removeLabel: (position: number) => `Remove highlight ${position}`,
    moveUpLabel: (position: number) => `Move highlight ${position} up`,
    moveDownLabel: (position: number) => `Move highlight ${position} down`,
  },
} satisfies Meta<typeof Repeater>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const WithItems: Story = {
  render: function Highlights(args) {
    const [items, setItems] = useState(['Wraparound porch', 'Studio over garage', 'Walk to the lake']);
    return (
      <Repeater
        {...args}
        description="Short chips shown under the price."
        items={items.map((item, index) => ({
          id: String(index),
          content: (
            <TextField
              label={`Highlight ${index + 1}`}
              value={item}
              onChange={(next) => setItems(items.map((existing, at) => (at === index ? next : existing)))}
            />
          ),
        }))}
        onAdd={() => setItems([...items, ''])}
        onRemove={(index) => setItems(items.filter((_, at) => at !== index))}
        onMove={(from, to) => {
          const next = [...items];
          const [moved] = next.splice(from, 1);
          if (moved !== undefined) next.splice(to, 0, moved);
          setItems(next);
        }}
      />
    );
  },
};

export const WithProblem: Story = { args: { errorMessage: 'Add at least one highlight.' } };
export const Full: Story = { args: { isFull: true, description: 'Up to three.' } };
