import type { Meta, StoryObj } from '@storybook/react-vite';
import { Heading, HelpCircle, Image, LayoutGrid, Megaphone, Type } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/Button/index.js';
import { OptionPicker, type OptionPickerProps } from './OptionPicker.js';

/** A button that opens the picker, as a screen would use it. */
function Example({ isOpen: startsOpen, ...props }: OptionPickerProps) {
  const [isOpen, setOpen] = useState(startsOpen);
  return (
    <>
      <Button variant="secondary" onPress={() => setOpen(true)}>
        Add section
      </Button>
      <OptionPicker {...props} isOpen={isOpen} onOpenChange={setOpen} />
    </>
  );
}

const meta = {
  title: 'Patterns/Overlays/OptionPicker',
  component: OptionPicker,
  render: (args) => <Example {...args} />,
  args: {
    isOpen: false,
    onOpenChange: () => undefined,
    onChoose: () => undefined,
    title: 'Add a section',
    closeLabel: 'Close',
    emptyText: 'This page has no kinds of section yet.',
    groups: [
      {
        id: 'opening',
        label: 'Opening',
        options: [{ id: 'page-hero', label: 'Page opening', description: 'A large heading, a line under it and a button.', icon: Heading }],
      },
      {
        id: 'content',
        label: 'Content',
        options: [
          { id: 'text', label: 'Text', description: 'Paragraphs, headings and lists.', icon: Type },
          { id: 'image', label: 'Picture', description: 'One picture across the page, with a caption.', icon: Image },
          { id: 'feature-grid', label: 'Feature grid', description: 'Three or more points side by side.', icon: LayoutGrid },
        ],
      },
      {
        id: 'action',
        label: 'Action',
        options: [
          { id: 'questions', label: 'Questions', description: 'Questions people ask, each opening to its answer.', icon: HelpCircle },
          { id: 'call-to-action', label: 'Call to action', description: 'One line and a button to act on it.', icon: Megaphone },
        ],
      },
    ],
  },
} satisfies Meta<typeof OptionPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};
export const Open: Story = { tags: ['!autodocs', 'overlay'], args: { isOpen: true } };
export const NothingToChoose: Story = { tags: ['!autodocs', 'overlay'], args: { isOpen: true, groups: [] } };
