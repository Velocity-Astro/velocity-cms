import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Button } from '../Button/index.js';
import { Tooltip } from './Tooltip.js';

const example = (
  <Tooltip content="Saves without publishing">
    <Button>Save draft</Button>
  </Tooltip>
);

it('is hidden until its control is focused, then describes it', async () => {
  const user = userEvent.setup();
  render(example);
  expect(screen.queryByRole('tooltip')).toBeNull();
  await user.tab();
  const tooltip = screen.getByRole('tooltip');
  expect(tooltip.textContent).toBe('Saves without publishing');
  expect(screen.getByRole('button').getAttribute('aria-describedby')).toBe(tooltip.id);
});

it('goes away on Escape', async () => {
  const user = userEvent.setup();
  render(example);
  await user.tab();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('tooltip')).toBeNull();
});

it('has no accessibility violations while showing', async () => {
  const user = userEvent.setup();
  render(example);
  await user.tab();
  await expectAccessible(document.body);
});
