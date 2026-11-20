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
/** A picture of a section, drawn here so the story asks nothing of the network. */
const picture = (tone: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"><rect width="160" height="90" fill="${tone}"/><rect x="16" y="20" width="80" height="10" rx="2" fill="#fff"/><rect x="16" y="38" width="120" height="5" rx="2" fill="#fff" opacity=".7"/><rect x="16" y="58" width="36" height="12" rx="3" fill="#fff"/></svg>`)}`;

/** Once any option has a picture, every option is a card. One with no picture shows its icon in the frame. */
export const WithPictures: Story = {
  tags: ['!autodocs', 'overlay'],
  args: {
    isOpen: true,
    groups: [
      {
        id: 'opening',
        label: 'Opening',
        options: [{ id: 'page-hero', label: 'Page opening', description: 'A large heading, a line under it and a button.', image: picture('#334155') }],
      },
      {
        id: 'content',
        label: 'Content',
        options: [
          { id: 'text', label: 'Text', description: 'Paragraphs, headings and lists.', image: picture('#475569') },
          { id: 'image', label: 'Picture', description: 'One picture across the page.', image: picture('#0f766e') },
          { id: 'feature-grid', label: 'Feature grid', description: 'Three or more points side by side.', icon: LayoutGrid },
          { id: 'questions', label: 'Questions', description: 'Each opens to its answer.', image: picture('#7c2d12') },
        ],
      },
    ],
  },
};
export const NothingToChoose: Story = { tags: ['!autodocs', 'overlay'], args: { isOpen: true, groups: [] } };
