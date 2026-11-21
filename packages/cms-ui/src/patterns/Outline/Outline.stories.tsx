import type { Meta, StoryObj } from '@storybook/react-vite';
import { AlignLeft, Columns2, Image, PanelTop } from 'lucide-react';
import { Outline } from './Outline.js';

const meta = {
  title: 'Patterns/Navigation/Outline',
  component: Outline,
  args: {
    title: 'Sections',
    emptyText: 'No sections yet.',
    onChoose: () => undefined,
    currentId: 's2',
    items: [
      { id: 's1', label: 'Page opening', icon: PanelTop },
      { id: 's2', label: 'Two columns', icon: Columns2 },
      { id: 's3', label: 'Text', depth: 1, icon: AlignLeft },
      { id: 's4', label: 'Picture', depth: 1, icon: Image },
      { id: 's5', label: 'Text', icon: AlignLeft },
    ],
  },
} satisfies Meta<typeof Outline>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { items: [] } };
