import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Logo } from './Logo.js';

it('is an image with the name it is given', () => {
  render(<Logo label="Velocity" />);
  expect(screen.getByRole('img', { name: 'Velocity' })).toBeTruthy();
});

it('comes in the size asked for', () => {
  render(<Logo label="Velocity" size="lg" />);
  expect(screen.getByRole('img').getAttribute('class')).toContain('h-8');
});

it('has no accessibility violations', async () => {
  const { container } = render(<Logo label="Velocity" />);
  await expectAccessible(container);
});
