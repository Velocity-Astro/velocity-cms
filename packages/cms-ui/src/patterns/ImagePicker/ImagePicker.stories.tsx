import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { ImagePicker, type ImagePickerProps } from './ImagePicker.js';

/** A flat picture in one colour, so the stories need no files. */
const picture = (colour: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="${colour}"/></svg>`)}`;

const images = [
  { name: 'home-farmhouse', url: picture('#8a9a5b') },
  { name: 'outdoor-pergola', url: picture('#c2a878') },
  { name: 'room-bedroom', url: picture('#9aa7b8') },
  { name: 'room-kitchen-white', url: picture('#d9d4c7') },
  { name: 'room-living-fireplace', url: picture('#a8705a') },
];

/** Holds the choice, as a form would. */
function Example({ value: first, ...props }: ImagePickerProps) {
  const [value, setValue] = useState(first);
  return <ImagePicker {...props} value={value} onChange={setValue} />;
}

const meta = {
  title: 'Patterns/Forms/ImagePicker',
  component: ImagePicker,
  render: (args) => <Example {...args} />,
  args: {
    label: 'Cover photo',
    value: 'home-farmhouse',
    images,
    onChange: () => undefined,
    chooseLabel: 'Choose a photo',
    changeLabel: 'Change',
    noneText: 'No photo chosen',
    dialogTitle: 'Choose a photo',
    closeLabel: 'Close',
    emptyText: 'This site has no photos yet.',
  },
} satisfies Meta<typeof ImagePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NothingChosen: Story = { args: { value: null, isRequired: true, description: 'The first photo is the cover.' } };
/** The name is kept and shown when its file is gone. */
export const ImageNotFound: Story = { args: { value: 'removed-photo', errorMessage: 'This photo is no longer on the site.' } };
export const Choosing: Story = {
  tags: ['!autodocs', 'overlay'],
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Change' }));
  },
};
