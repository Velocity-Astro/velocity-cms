import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { RichTextEditor, type RichTextEditorProps } from './RichTextEditor.js';

const words = {
  toolbar: 'Formatting',
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  strike: 'Strikethrough',
  superscript: 'Superscript',
  subscript: 'Subscript',
  code: 'Code',
  heading: 'Heading',
  subheading: 'Subheading',
  smallHeading: 'Small heading',
  bulletList: 'Bulleted list',
  numberedList: 'Numbered list',
  quote: 'Quote',
  link: 'Link',
  linkAddress: 'Link address',
  linkHelp: 'A web address, or a page of this site such as /contact/.',
  linkApply: 'Apply',
  linkRemove: 'Remove link',
  linkNewTab: 'Open in a new tab',
  linkRel: 'Tell search engines',
  linkRelNone: 'Nothing',
  linkRelNofollow: 'Not to follow it',
  linkRelSponsored: 'It is paid for',
  colour: 'Text colour',
  colourNone: 'Standard colour',
  highlight: 'Highlight',
  highlightNone: 'No highlight',
  align: 'Alignment',
  alignLeft: 'Left',
  alignCenter: 'Centre',
  alignRight: 'Right',
  insert: 'Add',
  picture: 'Picture',
  table: 'Table',
  codeBlock: 'Code block',
  callout: 'Callout',
  details: 'Details that open',
  embed: 'Video, map or player',
  button: 'Button',
  divider: 'Divider',
  selection: 'Chosen words',
  slash: 'Add a block',
  slashSearch: 'Find a block',
  slashEmpty: 'Nothing by that name',
  settings: 'Settings',
  remove: 'Remove',
  pictureAlt: 'Description',
  pictureAltHelp: 'What the picture shows, for people who cannot see it. Leave empty if it is only decoration.',
  pictureCaption: 'Caption',
  pictureSize: 'Size',
  pictureSizeText: 'Text width',
  pictureSizeWide: 'Wide',
  pictureSizeFull: 'Full width',
  pictureLink: 'Link',
  pictureChange: 'Choose another picture',
  pictureMissing: 'This picture is no longer in the library',
  tableActions: 'Table',
  rowAbove: 'Add a row above',
  rowBelow: 'Add a row below',
  columnBefore: 'Add a column before',
  columnAfter: 'Add a column after',
  deleteRow: 'Remove the row',
  deleteColumn: 'Remove the column',
  headerRow: 'Header row',
  mergeCells: 'Merge cells',
  splitCell: 'Split the cell',
  deleteTable: 'Remove the table',
  tableStyle: 'Style',
  buttonStyle: 'Style',
  lookDefault: 'Standard',
  codeLanguage: 'Language',
  codeLanguageHelp: 'Such as js, css or html. Leave empty for plain text.',
  calloutTone: 'Kind',
  tones: { note: 'Note', tip: 'Tip', warning: 'Warning', success: 'Success' },
  detailsShow: 'Show',
  detailsHide: 'Hide',
  embedAddress: 'Address',
  embedHelp: 'A link to a video on YouTube, Vimeo or Loom, a place on Google Maps, or something on Spotify.',
  embedNotKnown: 'That address is not one that can be shown in the text. Add it as a link instead.',
  embedTitle: 'What it is',
  buttonLabel: 'Words on the button',
  shortcuts: 'Keyboard shortcuts',
  shortcutList: [
    { keys: 'Ctrl B', does: 'Bold' },
    { keys: 'Ctrl I', does: 'Italic' },
    { keys: 'Ctrl U', does: 'Underline' },
    { keys: '/', does: 'Add a block, at the start of a line' },
    { keys: '## ', does: 'Heading' },
    { keys: '- ', does: 'Bulleted list' },
    { keys: '1. ', does: 'Numbered list' },
    { keys: '> ', does: 'Quote' },
    { keys: '```', does: 'Code block' },
  ],
  count: (words: number, minutes: number) => `${words} ${words === 1 ? 'word' : 'words'}, about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} to read`,
};

const text = (value: string, ...marks: object[]) => ({
  type: 'text',
  text: value,
  ...(marks.length > 0 && { marks }),
});
const description = {
  type: 'doc' as const,
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [text('A farmhouse by the lake')],
    },
    {
      type: 'paragraph',
      content: [
        text('Four bedrooms, a '),
        text('wraparound porch', { type: 'bold' }),
        text(' and a kitchen that opens to the garden. '),
        text('Take the tour', { type: 'link', attrs: { href: '/tour/' } }),
        text('.'),
      ],
    },
    {
      type: 'bulletList',
      content: ['Private dock', 'New roof in 2025'].map((item) => ({
        type: 'listItem',
        content: [{ type: 'paragraph', content: [text(item)] }],
      })),
    },
    {
      type: 'blockquote',
      content: [
        {
          type: 'paragraph',
          content: [text('The light in the mornings is the reason we stayed.')],
        },
      ],
    },
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
  args: {
    label: 'Description',
    value: description,
    onChange: () => undefined,
    words,
  },
} satisfies Meta<typeof RichTextEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = {
  args: {
    value: null,
    isRequired: true,
    description: 'What makes this home worth a visit.',
  },
};
export const OnlySomeFormats: Story = {
  args: {
    label: 'Introduction',
    formats: ['bold', 'italic', 'link', 'lists'],
    description: 'Paragraphs, with bold, italics, links and lists.',
  },
};
const looks = {
  colours: [
    { name: 'brand', label: 'Brand', swatch: '#c2410c' },
    { name: 'muted', label: 'Muted', swatch: '#57534e' },
  ],
  highlights: [{ name: 'sun', label: 'Sun', swatch: '#fde68a' }],
  tables: [{ name: 'striped', label: 'Striped' }],
  buttons: [
    { name: 'primary', label: 'Primary' },
    { name: 'outline', label: 'Outline' },
  ],
};
const pictures: Readonly<Record<string, string>> = {
  'porch.webp': 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect width="16" height="9" fill="#d6d3d1"/></svg>'),
};
const article = {
  type: 'doc' as const,
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [text('What the house holds')],
    },
    {
      type: 'paragraph',
      content: [
        text('A porch that '),
        text('faces the lake', { type: 'colour', attrs: { name: 'brand' } }),
        text(', and a kitchen with '),
        text('new floors', { type: 'highlight', attrs: { name: 'sun' } }),
        text('.'),
      ],
    },
    {
      type: 'image',
      attrs: {
        image: 'porch.webp',
        alt: 'The porch in the evening',
        caption: 'The porch, facing west',
        size: 'wide',
      },
    },
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: ['Room', 'Size'].map((cell) => ({
            type: 'tableHeader',
            content: [{ type: 'paragraph', content: [text(cell)] }],
          })),
        },
        {
          type: 'tableRow',
          content: ['Kitchen', '20 m²'].map((cell) => ({
            type: 'tableCell',
            content: [{ type: 'paragraph', content: [text(cell)] }],
          })),
        },
      ],
    },
    {
      type: 'callout',
      attrs: { tone: 'tip' },
      content: [{ type: 'paragraph', content: [text('Visits are on Saturdays.')] }],
    },
    {
      type: 'codeBlock',
      attrs: { language: 'html' },
      content: [text('<p>Hello</p>')],
    },
    { type: 'horizontalRule' },
    {
      type: 'button',
      attrs: { label: 'Book a visit', href: '/visit/', style: 'primary' },
    },
  ],
};

const longForm = {
  label: 'Article',
  value: article,
  looks,
  onPickImage: async () => ({
    image: 'porch.webp',
    src: pictures['porch.webp'],
  }),
  imageSrc: (image) => pictures[image],
  embedFrom: (address) => (address.includes('youtu') ? { provider: 'youtube', id: 'dQw4w9WgXcQ', title: 'Video' } : undefined),
  embedName: () => 'YouTube',
} satisfies Partial<RichTextEditorProps>;

export const LongForm: Story = { args: longForm };
export const AddMenu: Story = {
  tags: ['!autodocs', 'overlay'],
  args: longForm,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Add' }));
  },
};
export const ColourMenu: Story = {
  tags: ['!autodocs', 'overlay'],
  args: longForm,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Text colour' }));
  },
};
export const WithError: Story = {
  args: {
    value: null,
    isRequired: true,
    errorMessage: 'Fill this in before publishing.',
  },
};
export const AddingALink: Story = {
  tags: ['!autodocs', 'overlay'],
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Link' }));
  },
};
