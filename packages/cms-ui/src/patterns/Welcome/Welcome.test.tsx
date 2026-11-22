import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Welcome } from './Welcome.js';

it('is the screen\'s heading: the greeting, then the name on its own line, marked', () => {
  const { container } = render(<Welcome eyebrow="Saturday" title="Good morning," name="Dana Whitfield" description="3 drafts are waiting." />);
  const heading = screen.getByRole('heading', { level: 1 });
  expect(heading.textContent).toBe('Good morning, Dana Whitfield');
  expect(container.querySelector('mark')?.textContent).toBe('Dana Whitfield');
  expect(screen.getByText('Saturday')).toBeTruthy();
  // What is waiting is smaller words under the heading, not part of it.
  expect(screen.getByText('3 drafts are waiting.').closest('h1')).toBeNull();
});

it('marks nothing when there is no name', () => {
  const { container, rerender } = render(<Welcome title="Home" name="" />);
  expect(container.querySelector('mark')).toBeNull();
  rerender(<Welcome title="Home" />);
  expect(container.querySelector('mark')).toBeNull();
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Home');
});

it('holds what to do and what stands beside it', () => {
  render(<Welcome title="Hello" actions={<button type="button">Continue</button>} aside={<p>The site</p>} />);
  expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  expect(screen.getByText('The site')).toBeTruthy();
});

it('has no accessibility violations', async () => {
  const { container } = render(<Welcome eyebrow="Saturday" title="Good morning," name="Dana" description="3 drafts are waiting." />);
  await expectAccessible(container);
});
