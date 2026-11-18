import type { Meta, StoryObj } from '@storybook/react-vite';
import { Copy, EyeOff, HelpCircle, LayoutTemplate, Megaphone, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { TextField } from '../../components/TextField/index.js';
import { SectionList, type SectionListItem } from './SectionList.js';

const actions = [
  { id: 'duplicate', label: 'Duplicate', icon: Copy },
  { id: 'hide', label: 'Hide', icon: EyeOff },
  { id: 'remove', label: 'Remove', icon: Trash2, tone: 'danger' as const },
];

const sections: SectionListItem[] = [
  { id: 'a', title: 'Page opening', summary: 'Why list with us', icon: LayoutTemplate, content: <TextField label="Title" value="Why list with us" />, actions },
  { id: 'b', title: 'Questions', summary: 'What sellers ask first', icon: HelpCircle, content: <TextField label="Title" value="What sellers ask first" />, actions },
  { id: 'c', title: 'Call to action', summary: 'Find out what your home could sell for', icon: Megaphone, content: <TextField label="Title" value="Find out what your home could sell for" />, actions },
];

const meta = {
  title: 'Patterns/Forms/SectionList',
  component: SectionList,
  args: {
    label: 'Sections',
    items: sections,
    openIds: [],
    onOpenChange: () => {},
    emptyText: 'No sections yet. Add one to start the page.',
    addLabel: 'Add section',
    onAdd: () => {},
    onMove: () => {},
    onAction: () => {},
    moveUpLabel: (position: number) => `Move section ${position} up`,
    moveDownLabel: (position: number) => `Move section ${position} down`,
    moreLabel: (position: number) => `More for section ${position}`,
    dragLabel: (position: number) => `Drag section ${position}`,
  },
} satisfies Meta<typeof SectionList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

export const Working: Story = {
  render: function Sections(args) {
    const [items, setItems] = useState(sections);
    const [open, setOpen] = useState<readonly string[]>(['a']);
    return (
      <SectionList
        {...args}
        items={items}
        openIds={open}
        onOpenChange={(id, isOpen) => setOpen(isOpen ? [...open, id] : open.filter((other) => other !== id))}
        onMove={(from, to) => {
          const next = [...items];
          const [moved] = next.splice(from, 1);
          if (moved) next.splice(to, 0, moved);
          setItems(next);
        }}
        onAction={(id, action) => action === 'remove' && setItems(items.filter((item) => item.id !== id))}
      />
    );
  },
};

export const OneOpen: Story = { args: { openIds: ['b'] } };
export const Hidden: Story = { args: { items: sections.map((section, index) => (index === 1 ? { ...section, tag: 'Hidden' } : section)) } };
export const WithProblem: Story = { args: { items: sections.map((section, index) => (index === 2 ? { ...section, problem: 'Title: fill this in before publishing.' } : section)) } };
export const Empty: Story = { args: { items: [] } };
export const Full: Story = { args: { isFull: true, description: 'Up to three sections.' } };
