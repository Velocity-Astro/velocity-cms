import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Text } from './Text.js';

it('renders a paragraph in the body size by default', () => {
  render(<Text>Hello</Text>);
  const text = screen.getByText('Hello');
  expect(text.tagName).toBe('P');
  expect(text.className).toBe('text-base text-foreground font-normal');
});

it('changes element, size, tone and weight through props', async () => {
  const { container } = render(
    <Text as="span" size="sm" tone="muted" weight="medium" truncate>
      Edited
    </Text>,
  );
  const text = screen.getByText('Edited');
  expect(text.tagName).toBe('SPAN');
  for (const name of ['text-sm', 'text-foreground-muted', 'font-medium', 'truncate']) expect(text.className).toContain(name);
  await expectAccessible(container);
});
