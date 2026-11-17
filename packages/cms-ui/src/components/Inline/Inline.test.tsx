import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Inline } from './Inline.js';

it('lays children out in a row, centred, with the default gap', () => {
  render(<Inline>One</Inline>);
  expect(screen.getByText('One').className).toBe('flex flex-row gap-2 items-center justify-start');
});

it('spreads and wraps when asked', async () => {
  const { container } = render(
    <Inline justify="between" wrap gap={4}>
      Row
    </Inline>,
  );
  const row = screen.getByText('Row');
  for (const name of ['justify-between', 'flex-wrap', 'gap-4']) expect(row.className).toContain(name);
  await expectAccessible(container);
});
