import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { TextField } from './TextField.js';

it('names the input by its label and reports what is typed', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<TextField label="Street" onChange={onChange} />);
  await user.type(screen.getByRole('textbox', { name: 'Street' }), 'Elm');
  expect(onChange).toHaveBeenLastCalledWith('Elm');
});

it('ties the description to the input, so it is read out with the field', () => {
  render(<TextField label="Street" description="As it appears on the listing" />);
  const input = screen.getByRole('textbox', { name: 'Street' });
  const description = screen.getByText('As it appears on the listing');
  expect(input.getAttribute('aria-describedby')).toContain(description.id);
});

it('marks the field required for screen readers without adding a word to its name', () => {
  render(<TextField label="Street" isRequired />);
  const input = screen.getByRole('textbox', { name: 'Street' });
  expect(input.hasAttribute('required') || input.getAttribute('aria-required') === 'true').toBe(true);
});

it('shows an error, marks the input invalid and ties the message to it', () => {
  render(<TextField label="Street" errorMessage="Enter the street address." />);
  const input = screen.getByRole('textbox', { name: 'Street' });
  const error = screen.getByText('Enter the street address.');
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(input.getAttribute('aria-describedby')).toContain(error.id);
});

it('cannot be typed in when disabled or read-only', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  const { rerender } = render(<TextField label="Street" defaultValue="Elm" onChange={onChange} isDisabled />);
  await user.type(screen.getByRole('textbox'), 'x');
  rerender(<TextField label="Street" defaultValue="Elm" onChange={onChange} isReadOnly />);
  await user.type(screen.getByRole('textbox'), 'x');
  expect(onChange).not.toHaveBeenCalled();
});

it('has no accessibility violations, with and without an error', async () => {
  const { container, rerender } = render(<TextField label="Street" description="As it appears" isRequired />);
  await expectAccessible(container);
  rerender(<TextField label="Street" errorMessage="Enter the street address." />);
  await expectAccessible(container);
});

it('keeps its label for screen readers when the label is hidden', () => {
  render(<TextField label="Photo 2" isLabelHidden />);
  expect(screen.getByText('Photo 2').className).toContain('sr-only');
});
