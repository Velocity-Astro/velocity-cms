import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { RichTextEditor, type RichTextEditorProps } from './RichTextEditor.js';

const words = {
  toolbar: 'Formatting',
  bold: 'Bold',
  italic: 'Italic',
  heading: 'Heading',
  subheading: 'Subheading',
  bulletList: 'Bulleted list',
  numberedList: 'Numbered list',
  quote: 'Quote',
  link: 'Link',
  linkAddress: 'Link address',
  linkHelp: 'A web address, or a page of this site such as /contact/.',
  linkApply: 'Apply',
  linkRemove: 'Remove link',
};

const text = (value: string, ...marks: object[]) => ({ type: 'text', text: value, ...(marks.length > 0 && { marks }) });
const description = {
  type: 'doc' as const,
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [text('A farmhouse by the lake')] },
    { type: 'paragraph', content: [text('Four bedrooms, a '), text('wraparound porch', { type: 'bold' }), text(' and a kitchen that opens to the garden. '), text('Take the tour', { type: 'link', attrs: { href: '/tour/' } }), text('.')] },
    { type: 'bulletList', content: ['Private dock', 'New roof in 2025'].map((item) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [text(item)] }] })) },
    { type: 'blockquote', content: [{ type: 'paragraph', content: [text('The light in the mornings is the reason we stayed.')] }] },
  ],
};

/** Holds the text, as a form would. */
function Example({ value: first, ...props }: RichTextEditorProps) {
  const [value, setValue] = useState(first);
  return <RichTextEditor {...props} value={value} onChange={setValue} />;
}

const meta = {
  title: 'Components/Forms/RichTextEditor',
  component: RichTextEditor,
  render: (args) => <Example {...args} />,
  args: { label: 'Description', value: description, onChange: () => undefined, words },
} satisfies Meta<typeof RichTextEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { value: null, isRequired: true, description: 'What makes this home worth a visit.' } };
export const WithError: Story = { args: { value: null, isRequired: true, errorMessage: 'Fill this in before publishing.' } };
export const AddingALink: Story = {
  tags: ['!autodocs', 'overlay'],
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Link' }));
  },
};
