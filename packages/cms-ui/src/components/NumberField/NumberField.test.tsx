import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { NumberField } from './NumberField.js';

it('shows its number in the reader\'s format, named by its label', () => {
  render(<NumberField label="Price" value={845000} />);
  expect((screen.getByRole('textbox', { name: 'Price' }) as HTMLInputElement).value).toBe('845,000');
});

it('reports a number when the person leaves the field', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<NumberField label="Price" onChange={onChange} />);
  await user.type(screen.getByRole('textbox'), '412500');
  await user.tab();
  expect(onChange).toHaveBeenLastCalledWith(412500);
});

it('reports null when it is emptied', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<NumberField label="Price" defaultValue={5} onChange={onChange} />);
  await user.clear(screen.getByRole('textbox'));
  await user.tab();
  expect(onChange).toHaveBeenLastCalledWith(null);
});

it('keeps the value inside its limits and whole when asked', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<NumberField label="Bedrooms" onChange={onChange} minValue={0} maxValue={20} isInteger />);
  await user.type(screen.getByRole('textbox'), '99');
  await user.tab();
  expect(onChange).toHaveBeenLastCalledWith(20);
});

it('shows an error and marks the field invalid', () => {
  render(<NumberField label="Price" errorMessage="Enter a price." />);
  const input = screen.getByRole('textbox');
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(input.getAttribute('aria-describedby')).toContain(screen.getByText('Enter a price.').id);
});

it('has no accessibility violations', async () => {
  const { container } = render(<NumberField label="Price" description="In dollars" isRequired />);
  await expectAccessible(container);
});

it('keeps its label for screen readers when the label is hidden', () => {
  render(<NumberField label="Photo 2" isLabelHidden />);
  expect(screen.getByText('Photo 2').className).toContain('sr-only');
});
