import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Meter } from './Meter.js';

it('is a meter named by its label, which says how far along in words', () => {
  render(<Meter label="November target" value={13800} max={20000} valueText="69% of $20,000" />);
  const meter = screen.getByRole('meter', { name: 'November target' });
  expect(meter.getAttribute('aria-valuetext')).toBe('69% of $20,000');
  expect(meter.getAttribute('aria-valuenow')).toBe('13800');
  expect(screen.getByText('69% of $20,000')).toBeTruthy();
});

it('fills the track in twentieths, and no further than full', () => {
  const { container, rerender } = render(<Meter label="Target" value={13800} max={20000} valueText="69%" />);
  const fill = () => container.querySelector('.bg-brand-fill')?.getAttribute('class') ?? '';
  expect(fill()).toContain('w-14/20');
  rerender(<Meter label="Target" value={50000} max={20000} valueText="250%" />);
  expect(fill()).toContain('w-full');
  rerender(<Meter label="Target" value={0} max={20000} valueText="0%" />);
  expect(fill()).toContain('w-0');
});

it('has no accessibility violations', async () => {
  const { container } = render(<Meter label="November target" value={13800} max={20000} valueText="69% of $20,000" />);
  await expectAccessible(container);
});
