import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { RichTextEditor, type RichTextDocument, type RichTextFormat } from './RichTextEditor.js';

// The editor asks what is under the pointer to place the cursor. This page has no layout, so
// the answer is "nothing". Set here and not for every test: other parts behave differently
// once a page can answer that question.
document.elementFromPoint = () => null;

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
  linkHelp: 'A web address, or a page of this site.',
  linkApply: 'Apply',
  linkRemove: 'Remove link',
};
const paragraph = (value: string, ...marks: object[]) => ({ type: 'paragraph', content: [{ type: 'text', text: value, ...(marks.length > 0 && { marks }) }] });
const doc = (...content: object[]): RichTextDocument => ({ type: 'doc', content });

interface ExampleProps {
  first?: RichTextDocument | null;
  onChange?: (value: RichTextDocument | null) => void;
  errorMessage?: string;
  formats?: readonly RichTextFormat[];
}

function Example({ first = null, onChange, errorMessage, formats }: ExampleProps) {
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
    />
  );
}

const box = () => screen.getByRole('textbox', { name: /^Description/ });
const tool = (name: string) => within(screen.getByRole('toolbar', { name: 'Formatting' })).getByRole('button', { name });
const last = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls.at(-1)?.[0] as RichTextDocument | null;

it('shows the text it is given, named by its label and described by its help', () => {
  render(<Example first={doc({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'The house' }] }, paragraph('Four bedrooms.'))} />);
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
  expect(last(onChange)).toEqual(doc({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'The house' }] }));
  expect(tool('Heading').getAttribute('aria-pressed')).toBe('true');

  await userEvent.click(tool('Heading'));
  expect(last(onChange)).toEqual(doc(paragraph('The house')));
  expect(tool('Heading').getAttribute('aria-pressed')).toBe('false');

  await userEvent.click(tool('Bulleted list'));
  expect(last(onChange)).toEqual(doc({ type: 'bulletList', content: [{ type: 'listItem', content: [paragraph('The house')] }] }));
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
  const { container } = render(<Example formats={['bold', 'link']} onChange={onChange} first={doc({ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'The house' }] })} />);
  const toolbar = screen.getByRole('toolbar', { name: 'Formatting' });
  expect(within(toolbar).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Bold', 'Link']);
  expect(container.querySelector('h2')).toBeNull();
  expect(box().textContent).toBe('The house');
  await expectAccessible(container);
});

it('has no toolbar when it is given no formats', () => {
  render(<Example formats={[]} />);
  expect(screen.queryByRole('toolbar')).toBeNull();
  expect(box().getAttribute('role')).toBe('textbox');
});
