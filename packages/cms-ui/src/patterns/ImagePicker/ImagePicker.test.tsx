import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { ImagePicker } from './ImagePicker.js';

const images = [
  { name: 'porch', url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' },
  { name: 'kitchen', url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' },
];

function Example({ first = null, onChange }: { first?: string | null; onChange?: (name: string) => void }) {
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
