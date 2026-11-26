import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { RichTextEditor, type RichTextDocument, type RichTextEditorProps, type RichTextFormat } from './RichTextEditor.js';

// The editor asks what is under the pointer to place the cursor. This page has no layout, so
// the answer is "nothing". Set here and not for every test: other parts behave differently
// once a page can answer that question.
document.elementFromPoint = () => null;

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
const paragraph = (value: string, ...marks: object[]) => ({
  type: 'paragraph',
  content: [{ type: 'text', text: value, ...(marks.length > 0 && { marks }) }],
});
const doc = (...content: object[]): RichTextDocument => ({
  type: 'doc',
  content,
});

interface ExampleProps extends Partial<Pick<RichTextEditorProps, 'looks' | 'onPickImage' | 'onUploadImage' | 'imageSrc' | 'embedFrom' | 'onPasteDropped'>> {
  first?: RichTextDocument | null;
  onChange?: (value: RichTextDocument | null) => void;
  errorMessage?: string;
  formats?: readonly RichTextFormat[];
}

function Example({ first = null, onChange, errorMessage, formats, ...more }: ExampleProps) {
  const [value, setValue] = useState<RichTextDocument | null>(first);
  return (
    <RichTextEditor
      label="Description"
      description="What makes this home worth a visit."
      isRequired
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
      words={words}
      {...(errorMessage !== undefined && { errorMessage })}
      {...(formats !== undefined && { formats })}
      {...more}
    />
  );
}

const box = () => screen.getByRole('textbox', { name: /^Description/ });
const tool = (name: string) => within(screen.getByRole('toolbar', { name: 'Formatting' })).getByRole('button', { name });
const last = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls.at(-1)?.[0] as RichTextDocument | null;

it('shows the text it is given, named by its label and described by its help', () => {
  render(
    <Example
      first={doc(
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'The house' }],
        },
        paragraph('Four bedrooms.'),
      )}
    />,
  );
  expect(within(box()).getByRole('heading', { level: 2, name: 'The house' })).toBeTruthy();
  expect(within(box()).getByText('Four bedrooms.')).toBeTruthy();
  expect(box().getAttribute('aria-multiline')).toBe('true');
  expect(box().getAttribute('aria-required')).toBe('true');
  expect(document.getElementById(box().getAttribute('aria-describedby') ?? '')?.textContent).toBe('What makes this home worth a visit.');
});

it('formats the text the cursor is in with a toolbar button, and takes the format off again', async () => {
  const onChange = vi.fn();
  render(<Example first={doc(paragraph('The house'))} onChange={onChange} />);
  await userEvent.click(tool('Heading'));
  expect(last(onChange)).toEqual(
    doc({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'The house' }],
    }),
  );
  expect(tool('Heading').getAttribute('aria-pressed')).toBe('true');

  await userEvent.click(tool('Heading'));
  expect(last(onChange)).toEqual(doc(paragraph('The house')));
  expect(tool('Heading').getAttribute('aria-pressed')).toBe('false');

  await userEvent.click(tool('Bulleted list'));
  expect(last(onChange)).toEqual(
    doc({
      type: 'bulletList',
      content: [{ type: 'listItem', content: [paragraph('The house')] }],
    }),
  );
});

it('moves through the toolbar with the arrow keys, as one stop in the tab order', async () => {
  render(<Example first={doc(paragraph('The house'))} />);
  await userEvent.tab();
  expect(document.activeElement).toBe(tool('Bold'));
  await userEvent.keyboard('{ArrowRight}');
  expect(document.activeElement).toBe(tool('Italic'));
  await userEvent.tab();
  expect(document.activeElement).toBe(box());
});

it('says there is no text once nothing is left to read', async () => {
  const onChange = vi.fn();
  render(<Example first={doc(paragraph('Hi'))} onChange={onChange} />);
  await userEvent.click(tool('Heading'));
  expect(last(onChange)).not.toBeNull();
  await userEvent.click(box());
  await userEvent.keyboard('{Control>}a{/Control}{Backspace}');
  await waitFor(() => expect(last(onChange)).toBeNull());
});

it('puts a link on the text from a small panel, and takes it off there too', async () => {
  const onChange = vi.fn();
  render(<Example first={doc(paragraph('Take the tour'))} onChange={onChange} />);
  await userEvent.click(box());
  await userEvent.keyboard('{Control>}a{/Control}');
  await userEvent.click(tool('Link'));
  const panel = within(await screen.findByRole('dialog', { name: 'Link' }));
  await userEvent.type(panel.getByRole('textbox', { name: 'Link address' }), '/tour/{Enter}');
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Link' })).toBeNull());
  expect(JSON.stringify(last(onChange))).toContain('"href":"/tour/"');
  expect(within(box()).getByRole('link', { name: 'Take the tour' })).toBeTruthy();

  await userEvent.click(tool('Link'));
  const again = within(await screen.findByRole('dialog', { name: 'Link' }));
  expect(again.getByRole<HTMLInputElement>('textbox', { name: 'Link address' }).value).toBe('/tour/');
  await userEvent.click(again.getByRole('button', { name: 'Remove link' }));
  expect(last(onChange)).toEqual(doc(paragraph('Take the tour')));
});

it('does not send the form it is in when a link is applied', async () => {
  const onSubmit = vi.fn();
  render(
    <form onSubmit={onSubmit}>
      <Example first={doc(paragraph('Take the tour'))} />
    </form>,
  );
  await userEvent.click(box());
  await userEvent.keyboard('{Control>}a{/Control}');
  await userEvent.click(tool('Link'));
  const panel = within(await screen.findByRole('dialog', { name: 'Link' }));
  await userEvent.type(panel.getByRole('textbox', { name: 'Link address' }), '/tour/{Enter}');
  await waitFor(() => expect(within(box()).getByRole('link', { name: 'Take the tour' })).toBeTruthy());
  expect(onSubmit).not.toHaveBeenCalled();
});

it('shows what is wrong and marks the box', () => {
  render(<Example errorMessage="Fill this in before publishing." />);
  expect(box().getAttribute('aria-invalid')).toBe('true');
  expect(screen.getByText('Fill this in before publishing.')).toBeTruthy();
});

it('has no accessibility violations, with text and with the link panel open', async () => {
  const { container } = render(<Example first={doc(paragraph('Four bedrooms.'))} />);
  await expectAccessible(container);
  await userEvent.click(tool('Link'));
  await screen.findByRole('dialog', { name: 'Link' });
  await expectAccessible(document.body);
});

it('offers only the formats it is given, and shows a heading it is handed as a paragraph', async () => {
  const onChange = vi.fn();
  const { container } = render(
    <Example
      formats={['bold', 'link']}
      onChange={onChange}
      first={doc({
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'The house' }],
      })}
    />,
  );
  const toolbar = screen.getByRole('toolbar', { name: 'Formatting' });
  expect(
    within(toolbar)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label')),
  ).toEqual(['Bold', 'Link']);
  expect(container.querySelector('h2')).toBeNull();
  expect(box().textContent).toBe('The house');
  await expectAccessible(container);
});

it('has no toolbar when it is given no formats', () => {
  render(<Example formats={[]} />);
  expect(screen.queryByRole('toolbar')).toBeNull();
  expect(box().getAttribute('role')).toBe('textbox');
});

const looks = {
  colours: [
    { name: 'brand', label: 'Brand', swatch: '#f97316' },
    { name: 'muted', label: 'Muted', swatch: '#6b7280' },
  ],
  highlights: [{ name: 'sun', label: 'Sun', swatch: '#fde68a' }],
};

it("colours chosen words from the site's palette, by name, and takes the colour off again", async () => {
  const onChange = vi.fn();
  render(<Example first={doc(paragraph('Open house'))} onChange={onChange} looks={looks} />);
  await userEvent.click(box());
  await userEvent.keyboard('{Control>}a{/Control}');
  await userEvent.click(tool('Text colour'));
  await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Brand' }));
  expect(last(onChange)).toEqual(doc(paragraph('Open house', { type: 'colour', attrs: { name: 'brand' } })));

  await userEvent.click(tool('Text colour'));
  await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Standard colour' }));
  expect(last(onChange)).toEqual(doc(paragraph('Open house')));
});

it('offers no colours where the site has none, so nobody picks a colour of their own', () => {
  render(<Example first={doc(paragraph('Open house'))} />);
  expect(within(screen.getByRole('toolbar', { name: 'Formatting' })).queryByRole('button', { name: 'Text colour' })).toBeNull();
});

it('underlines with a button, as a mark of its own', async () => {
  const onChange = vi.fn();
  render(<Example first={doc(paragraph('Open house'))} onChange={onChange} />);
  await userEvent.click(box());
  await userEvent.keyboard('{Control>}a{/Control}');
  await userEvent.click(tool('Underline'));
  expect(last(onChange)).toEqual(doc(paragraph('Open house', { type: 'underline' })));
});

it('adds a table from the Add menu, with a header row, and offers its actions while the cursor is in it', async () => {
  const onChange = vi.fn();
  render(<Example first={doc(paragraph('Rooms'))} onChange={onChange} />);
  await userEvent.click(box());
  await userEvent.click(tool('Add'));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Table' }));
  const table = last(onChange)?.content?.find((block) => (block as { type: string }).type === 'table') as { content: { content: { type: string }[] }[] } | undefined;
  expect(table?.content).toHaveLength(3);
  expect(table?.content[0]?.content.map((cell) => cell.type)).toEqual(['tableHeader', 'tableHeader', 'tableHeader']);
  await waitFor(() => expect(tool('Table')).toBeTruthy());
});

it('opens a menu of blocks when / starts an empty line, and finds one by name', async () => {
  const onChange = vi.fn();
  render(<Example onChange={onChange} />);
  await userEvent.click(box());
  await userEvent.keyboard('/');
  const search = await screen.findByRole('searchbox', { name: 'Find a block' });
  await userEvent.type(search, 'divider');
  await userEvent.keyboard('{ArrowDown}{Enter}');
  await waitFor(() => expect(JSON.stringify(last(onChange))).toContain('"horizontalRule"'));
  expect(JSON.stringify(last(onChange))).not.toContain('/');
});

it('adds a picture of the site chosen in the picker, kept by its name', async () => {
  const onChange = vi.fn();
  const onPickImage = vi.fn(async () => ({
    image: 'porch.webp',
    src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
  }));
  render(<Example first={doc(paragraph('Rooms'))} onChange={onChange} onPickImage={onPickImage} />);
  await userEvent.click(box());
  await userEvent.click(tool('Add'));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Picture' }));
  await waitFor(() => expect(JSON.stringify(last(onChange))).toContain('"image":"porch.webp"'));
  expect(onPickImage).toHaveBeenCalled();
});

it('offers no pictures or embeds when nobody can choose or read them', async () => {
  render(<Example first={doc(paragraph('Rooms'))} />);
  await userEvent.click(tool('Add'));
  const menu = await screen.findByRole('menu');
  expect(within(menu).queryByRole('menuitem', { name: 'Picture' })).toBeNull();
  expect(within(menu).queryByRole('menuitem', { name: 'Video, map or player' })).toBeNull();
  expect(within(menu).getByRole('menuitem', { name: 'Code block' })).toBeTruthy();
});

it('keeps only the formats a spot allows when text is handed to it, without losing the words', () => {
  render(
    <Example
      formats={['bold']}
      first={doc(
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [{ type: 'tableCell', content: [paragraph('Kitchen')] }],
            },
          ],
        },
        { type: 'horizontalRule' },
        paragraph('Porch', { type: 'italic' }),
      )}
    />,
  );
  expect(box().querySelector('table')).toBeNull();
  expect(box().querySelector('hr')).toBeNull();
  expect(box().querySelector('em')).toBeNull();
  expect(box().textContent).toContain('Kitchen');
  expect(box().textContent).toContain('Porch');
});

it('says how long a long text is', () => {
  render(<Example first={doc(paragraph('Four bedrooms by the lake.'))} />);
  expect(screen.getByText('5 words, about 1 minute to read')).toBeTruthy();
});

it('has no accessibility violations with every tool, and with the Add menu open', async () => {
  const { container } = render(<Example first={doc(paragraph('Four bedrooms.'))} looks={looks} onPickImage={async () => undefined} embedFrom={() => undefined} />);
  await expectAccessible(container);
  await userEvent.click(tool('Add'));
  await screen.findByRole('menu');
  await expectAccessible(document.body);
});
