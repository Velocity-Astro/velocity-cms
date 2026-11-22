import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { LoadingMark } from './LoadingMark.js';

it('says what is happening under the mark, and to screen readers', () => {
  const { container } = render(<LoadingMark label="Opening the editor" />);
  expect(screen.getByRole('status').textContent).toBe('Opening the editor');
  expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
});

it('draws each of the three facets in grey under its colour, arriving on its own', () => {
  const { container } = render(<LoadingMark label="Opening the editor" />);
  const pieces = [...container.querySelectorAll('svg > g')];
  expect(pieces.map((piece) => piece.getAttribute('class'))).toEqual(['motion-mark-top', 'motion-mark-left', 'motion-mark-right']);
  expect(pieces.every((piece) => piece.querySelectorAll('path').length === 2)).toBe(true);
  expect(pieces[0]?.querySelectorAll('path')[1]?.getAttribute('class')).toContain('fill-brand-fill');
});

it('has no accessibility violations', async () => {
  const { container } = render(<LoadingMark label="Opening the editor" />);
  await expectAccessible(container);
});
