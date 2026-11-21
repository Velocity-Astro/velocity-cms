import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Welcome } from './Welcome.js';

it('is the screen\'s heading, with the highlighted words marked where they appear', () => {
  const { container } = render(<Welcome eyebrow="Saturday" title="Good morning, Dana. 3 drafts are waiting." highlight="3 drafts" description="Two are new." />);
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Good morning, Dana. 3 drafts are waiting.');
  expect(container.querySelector('mark')?.textContent).toBe('3 drafts');
  expect(screen.getByText('Saturday')).toBeTruthy();
  expect(screen.getByText('Two are new.')).toBeTruthy();
});

it('marks the words where they stand whole, so a name is not found inside another word', () => {
  const { container } = render(<Welcome title="Good afternoon, No." highlight="No" />);
  expect(container.querySelector('mark')?.textContent).toBe('No');
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Good afternoon, No.');
  expect(container.querySelector('mark')?.previousSibling?.textContent).toBe('Good afternoon, ');
});

it('marks nothing when the words are not in the title, or there are none', () => {
  const { container, rerender } = render(<Welcome title="Everything is published." highlight="3 drafts" />);
  expect(container.querySelector('mark')).toBeNull();
  rerender(<Welcome title="Everything is published." />);
  expect(container.querySelector('mark')).toBeNull();
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Everything is published.');
});

it('holds what to do and what stands beside it', () => {
  render(<Welcome title="Hello" actions={<button type="button">Continue</button>} aside={<p>The site</p>} />);
  expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  expect(screen.getByText('The site')).toBeTruthy();
});

it('has no accessibility violations', async () => {
  const { container } = render(<Welcome eyebrow="Saturday" title="Good morning, Dana. 3 drafts are waiting." highlight="3 drafts" />);
  await expectAccessible(container);
});
