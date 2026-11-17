import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Heading } from './Heading.js';

it('renders the heading level asked for, sized to match', () => {
  render(<Heading level={2}>Details</Heading>);
  const heading = screen.getByRole('heading', { level: 2, name: 'Details' });
  expect(heading.className).toContain('text-xl');
});

it('lets size change the look without changing the level', async () => {
  const { container } = render(
    <Heading level={1} size="sm">
      Compact
    </Heading>,
  );
  const heading = screen.getByRole('heading', { level: 1 });
  expect(heading.className).toContain('text-base');
  expect(heading.className).not.toContain('text-2xl');
  await expectAccessible(container);
});
