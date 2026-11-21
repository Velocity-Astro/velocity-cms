import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileText, House, Image, MapPin, Plus, Settings } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/Button/index.js';
import { CommandPalette, type CommandPaletteProps } from './CommandPalette.js';

/** A button that opens the window, as the bar of the editor does. */
function Example({ isOpen: startsOpen, ...props }: CommandPaletteProps) {
  const [isOpen, setOpen] = useState(startsOpen);
  return (
    <>
      <Button variant="secondary" onPress={() => setOpen(true)}>
        Search
      </Button>
      <CommandPalette {...props} isOpen={isOpen} onOpenChange={setOpen} />
    </>
  );
}

const meta = {
  title: 'Patterns/Overlays/CommandPalette',
  component: CommandPalette,
  render: (args) => <Example {...args} />,
  args: {
    isOpen: false,
    onOpenChange: () => undefined,
    onAction: () => undefined,
    label: 'Search and commands',
    placeholder: 'Search, jump to or create anything',
    emptyText: 'Nothing matches that.',
    groups: [
      {
        id: 'go',
        label: 'Go to',
        items: [
          { id: 'home', label: 'Home', icon: House },
          { id: 'listings', label: 'Listings', detail: 'Content', icon: FileText },
          { id: 'neighborhoods', label: 'Neighborhoods', detail: 'Content', icon: MapPin },
          { id: 'media', label: 'Media', icon: Image },
          { id: 'settings', label: 'Settings', icon: Settings, keywords: 'email storage' },
        ],
      },
      {
        id: 'create',
        label: 'Create',
        items: [
          { id: 'new-listing', label: 'New listing', icon: Plus },
          { id: 'new-neighborhood', label: 'New neighborhood', icon: Plus },
        ],
      },
    ],
  },
} satisfies Meta<typeof CommandPalette>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};
export const Open: Story = { tags: ['!autodocs', 'overlay'], args: { isOpen: true } };
