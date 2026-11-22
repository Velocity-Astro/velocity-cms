import type { Meta, StoryObj } from '@storybook/react-vite';
import { MediaGrid } from './MediaGrid.js';

/** A picture that needs no network: a flat colour as an SVG. */
const picture = (colour: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="${colour}"/></svg>`)}`;

const meta = {
  title: 'Patterns/Media/MediaGrid',
  component: MediaGrid,
  args: {
    label: 'Photos',
    emptyText: 'No photos match.',
    onAction: () => undefined,
    items: [
      { id: 'porch', name: 'porch', url: picture('#b9c4b1'), note: '1600 × 900' },
      { id: 'kitchen', name: 'kitchen', url: picture('#d8c9b0'), note: '2400 × 1600' },
      { id: 'garden-at-dusk', name: 'garden-at-dusk', url: picture('#a7b6c9'), note: 'Comes with the site' },
    ],
  },
} satisfies Meta<typeof MediaGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { items: [] } };
/** One just uploaded: marked, and outlined in the brand's colour. */
export const Marked: Story = {
  args: {
    items: [
      { id: 'new-porch', name: 'new-porch', url: picture('#c9b6a7'), note: '1600 × 900', badge: 'Just uploaded' },
      { id: 'porch', name: 'porch', url: picture('#b9c4b1'), note: '1600 × 900' },
    ],
  },
};
