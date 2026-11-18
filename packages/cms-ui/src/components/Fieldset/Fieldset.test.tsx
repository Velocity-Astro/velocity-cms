import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { TextField } from '../TextField/index.js';
import { Fieldset } from './Fieldset.js';

it('groups its fields under its legend', () => {
  render(
    <Fieldset legend="Address">
      <TextField label="City" />
    </Fieldset>,
  );
  const group = screen.getByRole('group', { name: 'Address' });
  expect(within(group).getByRole('textbox', { name: 'City' })).toBeTruthy();
});

it('shows help for the whole set', () => {
  render(<Fieldset legend="Address" description="Used for the map." />);
  expect(within(screen.getByRole('group')).getByText('Used for the map.')).toBeTruthy();
});

it('keeps its name for a screen reader when the legend is hidden', () => {
  render(
    <Fieldset legend="Address" isLegendHidden>
      <TextField label="City" />
    </Fieldset>,
  );
  expect(within(screen.getByRole('group', { name: 'Address' })).getByRole('textbox', { name: 'City' })).toBeTruthy();
});

it('is accessible', async () => {
  const { container } = render(
    <Fieldset legend="Address" description="Used for the map.">
      <TextField label="City" />
    </Fieldset>,
  );
  await expectAccessible(container);
});
