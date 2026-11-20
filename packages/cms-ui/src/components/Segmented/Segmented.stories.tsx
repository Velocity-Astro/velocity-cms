import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Segmented } from './Segmented.js';

const options = [
  { id: 'all', label: 'All' },
  { id: 'published', label: 'Published' },
  { id: 'drafts', label: 'Drafts' },
];

const meta = {
  title: 'Components/Forms/Segmented',
  component: Segmented,
  args: { label: 'Show', options, selected: 'all', onChange: () => undefined },
} satisfies Meta<typeof Segmented>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: function Render(args) {
    const [selected, setSelected] = useState(args.selected);
    return <Segmented {...args} selected={selected} onChange={setSelected} />;
  },
};
export const Swatches: Story = {
  args: {
    label: 'Background',
    isLabelShown: true,
    description: 'From the template\'s own colours.',
    selected: 'default',
    options: [
      { id: 'default', label: 'White', swatch: '#ffffff' },
      { id: 'secondary', label: 'Warm stone', swatch: '#f4f1ec' },
      { id: 'invert', label: 'Slate', swatch: '#1f2933' },
    ],
  },
};
export const WithOneOff: Story = { args: { options: [...options, { id: 'scheduled', label: 'Scheduled', isDisabled: true }] } };
