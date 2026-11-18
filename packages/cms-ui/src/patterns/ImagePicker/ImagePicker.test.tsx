import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { ImagePicker } from './ImagePicker.js';

const images = [
  { name: 'porch', url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' },
  { name: 'kitchen', url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' },
];

interface ExampleProps {
  first?: string | null;
  onChange?: (name: string) => void;
  onUpload?: (file: File) => Promise<void>;
  uploadError?: string;
}

function Example({ first = null, onChange, onUpload, uploadError }: ExampleProps) {
  const [value, setValue] = useState<string | null>(first);
  return (
    <ImagePicker
      label="Cover photo"
      value={value}
      images={images}
      onChange={(name) => {
        setValue(name);
        onChange?.(name);
      }}
      chooseLabel="Choose a photo"
      changeLabel="Change"
      noneText="No photo chosen"
      dialogTitle="Choose a photo"
      closeLabel="Close"
      emptyText="No photos yet"
      {...(onUpload && { onUpload, uploadLabel: 'Upload a photo', uploadHint: 'JPEG, PNG or WebP' })}
      {...(uploadError !== undefined && { uploadError })}
    />
  );
}

it('chooses an image with a pointer and closes the window', async () => {
  const onChange = vi.fn();
  render(<Example onChange={onChange} />);
  const field = screen.getByRole('group', { name: 'Cover photo' });
  expect(within(field).getByText('No photo chosen')).toBeTruthy();

  await userEvent.click(within(field).getByRole('button', { name: 'Choose a photo' }));
  const dialog = await screen.findByRole('dialog', { name: 'Choose a photo' });
  await userEvent.click(within(dialog).getByRole('option', { name: 'kitchen' }));

  expect(onChange).toHaveBeenCalledWith('kitchen');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(within(field).getByText('kitchen')).toBeTruthy();
  expect(within(field).getByRole('button', { name: 'Change' })).toBeTruthy();
});

it('chooses an image with the keyboard', async () => {
  const onChange = vi.fn();
  render(<Example first="porch" onChange={onChange} />);
  await userEvent.tab();
  await userEvent.keyboard('{Enter}');
  const dialog = await screen.findByRole('dialog', { name: 'Choose a photo' });
  expect(within(dialog).getByRole('option', { name: 'porch' }).getAttribute('aria-selected')).toBe('true');
  await userEvent.keyboard('{ArrowRight}{Enter}');
  expect(onChange).toHaveBeenCalledWith('kitchen');
});

it('keeps the choice when the window is closed with Escape', async () => {
  const onChange = vi.fn();
  render(<Example first="porch" onChange={onChange} />);
  await userEvent.click(screen.getByRole('button', { name: 'Change' }));
  await screen.findByRole('dialog');
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByText('porch')).toBeTruthy();
});

it('still shows the name of an image that is not there any more', () => {
  render(<Example first="removed" />);
  expect(screen.getByText('removed')).toBeTruthy();
});

it('has no accessibility violations, closed and open', async () => {
  const { container } = render(<Example first="porch" />);
  await expectAccessible(container);
  await userEvent.click(screen.getByRole('button', { name: 'Change' }));
  await screen.findByRole('dialog');
  await expectAccessible(document.body);
});

const photo = () => new File([Uint8Array.from([1, 2, 3])], 'Front porch.jpg', { type: 'image/jpeg' });
const fileInput = () => document.querySelector<HTMLInputElement>('input[type="file"]') as HTMLInputElement;

it('offers no upload unless it is given somewhere to send one', async () => {
  render(<Example />);
  await userEvent.click(screen.getByRole('button', { name: 'Choose a photo' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).queryByRole('button', { name: 'Upload a photo' })).toBeNull();
});

it('hands over a file picked from the computer and closes the window once it is taken', async () => {
  let taken: (() => void) | undefined;
  const onUpload = vi.fn(() => new Promise<void>((resolve) => (taken = resolve)));
  render(<Example onUpload={onUpload} />);
  await userEvent.click(screen.getByRole('button', { name: 'Choose a photo' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('JPEG, PNG or WebP')).toBeTruthy();
  expect(within(dialog).getByRole('button', { name: 'Upload a photo' })).toBeTruthy();

  const file = photo();
  await userEvent.upload(fileInput(), file);
  expect(onUpload).toHaveBeenCalledWith(file);
  // Still open while the file is on its way.
  expect(screen.getByRole('dialog')).toBeTruthy();

  taken?.();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

it('stays open when an upload fails, and says why', async () => {
  const onUpload = vi.fn(() => Promise.reject(new Error('refused')));
  const { rerender } = render(<Example onUpload={onUpload} />);
  await userEvent.click(screen.getByRole('button', { name: 'Choose a photo' }));
  await screen.findByRole('dialog');
  await userEvent.upload(fileInput(), photo());
  await waitFor(() => expect(onUpload).toHaveBeenCalled());

  rerender(<Example onUpload={onUpload} uploadError="Upload a JPEG, PNG or WebP." />);
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByRole('alert').textContent).toBe('Upload a JPEG, PNG or WebP.');
  await expectAccessible(document.body);
});
