import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { ColorPicker } from './ColorPicker.js';

const words = { label: 'Brand colour', pickLabel: 'Choose a colour', hueLabel: 'Hue' };

it('shows the colour as a hex colour, and hands back what is typed as one', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<ColorPicker {...words} value="#1f3a5f" onChange={onChange} />);
  const field = screen.getByRole('textbox', { name: 'Brand colour' });
  expect((field as HTMLInputElement).value.toLowerCase()).toBe('#1f3a5f');
  await user.clear(field);
  await user.type(field, '#C2410C');
  await user.tab();
  expect(onChange).toHaveBeenLastCalledWith('#c2410c');
});

it('hands back nothing when the field is emptied', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<ColorPicker {...words} value="#1f3a5f" onChange={onChange} />);
  await user.clear(screen.getByRole('textbox', { name: 'Brand colour' }));
  await user.tab();
  expect(onChange).toHaveBeenLastCalledWith(undefined);
});

it('opens an area of shades, a slider of hues and the suggested colours, and takes one at a press', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<ColorPicker {...words} value="#1f3a5f" presets={['#1f3a5f', '#c2410c']} presetsLabel="Suggested colours" onChange={onChange} />);
  await user.click(screen.getByRole('button', { name: 'Choose a colour' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Choose a colour' }));
  expect(dialog.getByRole('slider', { name: /Hue/ })).toBeTruthy();
  const suggested = within(dialog.getByRole('listbox', { name: 'Suggested colours' }));
  await user.click(suggested.getAllByRole('option')[1] as HTMLElement);
  expect(onChange).toHaveBeenLastCalledWith('#c2410c');
});

it('moves the hue with the arrow keys', async () => {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<ColorPicker {...words} value="#ff0000" onChange={onChange} />);
  await user.click(screen.getByRole('button', { name: 'Choose a colour' }));
  const hue = await screen.findByRole('slider', { name: /Hue/ });
  hue.focus();
  await user.keyboard('{ArrowRight}');
  expect(onChange).toHaveBeenCalled();
  expect(onChange.mock.lastCall?.[0]).toMatch(/^#[0-9a-f]{6}$/);
});

it('has no accessibility violations', async () => {
  const { container } = render(<ColorPicker {...words} value="#1f3a5f" description="Buttons and links." onChange={() => {}} />);
  await expectAccessible(container);
});
