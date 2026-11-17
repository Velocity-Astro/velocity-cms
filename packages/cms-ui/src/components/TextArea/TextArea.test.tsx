import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { TextArea } from './TextArea.js';

it('is a multi-line box named by its label that reports what is typed, line breaks included', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<TextArea label="Summary" onChange={onChange} />);
  const box = screen.getByRole('textbox', { name: 'Summary' });
  expect(box.tagName).toBe('TEXTAREA');
  await user.type(box, 'One{Enter}Two');
  expect(onChange).toHaveBeenLastCalledWith('One\nTwo');
});

it('ties its help and its error to the box', () => {
  const { rerender } = render(<TextArea label="Summary" description="Shown in search results" />);
  const box = screen.getByRole('textbox');
  expect(box.getAttribute('aria-describedby')).toContain(screen.getByText('Shown in search results').id);
  rerender(<TextArea label="Summary" errorMessage="Write a summary." />);
  expect(box.getAttribute('aria-invalid')).toBe('true');
  expect(box.getAttribute('aria-describedby')).toContain(screen.getByText('Write a summary.').id);
});

it('starts as tall as asked', () => {
  render(<TextArea label="Summary" rows={8} />);
  expect(screen.getByRole('textbox').getAttribute('rows')).toBe('8');
});

it('has no accessibility violations', async () => {
  const { container } = render(<TextArea label="Summary" description="Shown in search results" isRequired />);
  await expectAccessible(container);
});
