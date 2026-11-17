import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { SearchField } from './SearchField.js';

function Example({ start = '' }: { start?: string }) {
  const [value, setValue] = useState(start);
  return <SearchField label="Search listings" placeholder="Search by title" clearLabel="Clear search" value={value} onChange={setValue} />;
}

it('is a search box with the name it is given, and takes what is typed', async () => {
  const user = userEvent.setup();
  render(<Example />);
  const box = screen.getByRole('searchbox', { name: 'Search listings' });
  await user.type(box, 'lake');
  expect((box as HTMLInputElement).value).toBe('lake');
});

it('is emptied by its button, and by Escape', async () => {
  const user = userEvent.setup();
  render(<Example start="lake" />);
  const box = screen.getByRole('searchbox') as HTMLInputElement;
  await user.click(screen.getByRole('button', { name: 'Clear search' }));
  expect(box.value).toBe('');
  await user.type(box, 'mill{Escape}');
  expect(box.value).toBe('');
});

it('has no accessibility violations', async () => {
  const { container } = render(<Example start="lake" />);
  await expectAccessible(container);
});
