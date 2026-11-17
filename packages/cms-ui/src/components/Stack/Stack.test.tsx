import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Stack } from './Stack.js';

it('lays children out in a column with the default gap', () => {
  render(<Stack>One</Stack>);
  const stack = screen.getByText('One');
  expect(stack.className).toBe('flex flex-col gap-4 items-stretch');
});

it('renders a list when asked, so list items are announced as a list', async () => {
  const { container } = render(
    <Stack as="ul" gap={2}>
      <li>One</li>
      <li>Two</li>
    </Stack>,
  );
  expect(screen.getByRole('list').className).toContain('gap-2');
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
  await expectAccessible(container);
});

it('is at least as tall as the space it is in when asked to fill it', () => {
  render(<Stack as="section" fill />);
  expect(document.querySelector('section')?.className).toContain('min-h-full');
});
