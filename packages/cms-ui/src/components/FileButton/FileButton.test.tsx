import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { FileButton } from './FileButton.js';

const chooser = (container: HTMLElement) => container.querySelector('input[type="file"]') as HTMLInputElement;

it('hands back the file the person picked', async () => {
  const onSelect = vi.fn();
  const { container } = render(
    <FileButton accept="image" onSelect={onSelect}>
      Upload a photo
    </FileButton>,
  );
  const file = new File(['x'], 'porch.png', { type: 'image/png' });
  await userEvent.setup().upload(chooser(container), file);
  expect(onSelect).toHaveBeenCalledWith(file);
});

it('offers the chooser only the kind of file asked for', () => {
  const { container } = render(
    <FileButton accept="image" onSelect={() => undefined}>
      Upload a photo
    </FileButton>,
  );
  expect(chooser(container).accept).toBe('image/jpeg,image/png,image/webp');
  expect(screen.getByRole('button', { name: 'Upload a photo' })).toBeTruthy();
});

it('has no accessibility violations', async () => {
  const { container } = render(
    <FileButton accept="image" onSelect={() => undefined}>
      Upload a photo
    </FileButton>,
  );
  await expectAccessible(container);
});
