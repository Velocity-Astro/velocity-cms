import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { DateField } from './DateField.js';

const parts = () => within(screen.getByRole('group', { name: 'Listed on' })).getAllByRole('spinbutton');

it('shows a date as a part each for month, day and year', () => {
  render(<DateField label="Listed on" value="2026-11-17" />);
  expect(parts().map((part) => part.textContent)).toEqual(['11', '17', '2026']);
});

it('reports YYYY-MM-DD once every part is typed', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<DateField label="Listed on" onChange={onChange} />);
  await user.tab();
  await user.keyboard('03042027');
  expect(onChange).toHaveBeenLastCalledWith('2027-03-04');
});

it('changes a part with the arrow keys', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<DateField label="Listed on" defaultValue="2026-11-17" onChange={onChange} />);
  await user.tab();
  await user.keyboard('{ArrowUp}');
  expect(onChange).toHaveBeenLastCalledWith('2026-12-17');
});

it('treats a value that is not a date as empty', () => {
  render(<DateField label="Listed on" value="soon" />);
  expect(parts().map((part) => part.textContent)).toEqual(['mm', 'dd', 'yyyy']);
});

it('has no accessibility violations', async () => {
  const { container } = render(<DateField label="Listed on" description="Shown on the listing" defaultValue="2026-11-17" />);
  await expectAccessible(container);
});

it('keeps its label for screen readers when the label is hidden', () => {
  render(<DateField label="Photo 2" isLabelHidden />);
  expect(screen.getByText('Photo 2').className).toContain('sr-only');
});
