import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Spinner } from './Spinner.js';

it('is a status that says what is happening, even when the words are not shown', () => {
  render(<Spinner label="Loading listings" />);
  const status = screen.getByRole('status');
  expect(status.textContent).toBe('Loading listings');
  expect(screen.getByText('Loading listings').className).toContain('sr-only');
});

it('can show its label', () => {
  render(<Spinner label="Loading listings" showLabel />);
  expect(screen.getByText('Loading listings').className).not.toContain('sr-only');
});

it('has no accessibility violations', async () => {
  const { container } = render(<Spinner label="Loading listings" />);
  await expectAccessible(container);
});
