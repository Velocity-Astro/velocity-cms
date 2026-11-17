import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Box } from './Box.js';

it('renders its children in the element asked for, with a label for landmarks', () => {
  render(
    <Box as="aside" label="Details" padding={4}>
      Inside
    </Box>,
  );
  const aside = screen.getByRole('complementary', { name: 'Details' });
  expect(aside.textContent).toBe('Inside');
  expect(aside.className).toContain('p-4');
});

it('takes its look only from variants', () => {
  render(<Box surface="card" border radius="lg" shadow="sm">Card</Box>);
  const box = screen.getByText('Card');
  for (const name of ['bg-card', 'border-border', 'rounded-lg', 'shadow-sm']) expect(box.className).toContain(name);
});

it('has no accessibility violations', async () => {
  const { container } = render(<Box padding={4}>Inside</Box>);
  await expectAccessible(container);
});
