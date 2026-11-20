import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { Workbench } from './Workbench.js';

const example = () => (
  <Workbench paneLabel="The page" pane={<p>What it makes</p>}>
    <button type="button">In the form</button>
  </Workbench>
);

it('names the pane, so it can be found and skipped to', () => {
  render(example());
  expect(within(screen.getByRole('region', { name: 'The page' })).getByText('What it makes')).toBeTruthy();
});

it('puts the form first, so the keyboard reaches it before the pane', () => {
  render(example());
  const form = screen.getByRole('button', { name: 'In the form' });
  const pane = screen.getByRole('region', { name: 'The page' });
  expect(form.compareDocumentPosition(pane) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

const whole = (isFormAway: boolean) => (
  <>
    <button type="button">Behind</button>
    <Workbench paneLabel="The page" view="whole" isFormAway={isFormAway} bar={<button type="button">Back</button>} pane={<button type="button">On the page</button>}>
      <button type="button">In the form</button>
    </Workbench>
  </>
);

it('shows its bar only when it has the whole window', () => {
  const { rerender } = render(
    <Workbench paneLabel="The page" bar={<button type="button">Back</button>} pane={<p>What it makes</p>}>
      <button type="button">In the form</button>
    </Workbench>,
  );
  expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  rerender(
    <Workbench paneLabel="The page" view="whole" bar={<button type="button">Back</button>} pane={<p>What it makes</p>}>
      <button type="button">In the form</button>
    </Workbench>,
  );
  expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
});

it('keeps the form and the pane as they are when it takes the whole window and gives it back', () => {
  const { rerender } = render(example());
  const form = screen.getByRole('button', { name: 'In the form' });
  const pane = screen.getByText('What it makes');
  rerender(
    <Workbench paneLabel="The page" view="whole" pane={<p>What it makes</p>}>
      <button type="button">In the form</button>
    </Workbench>,
  );
  expect(screen.getByRole('button', { name: 'In the form' })).toBe(form);
  expect(screen.getByText('What it makes')).toBe(pane);
  rerender(example());
  expect(screen.getByRole('button', { name: 'In the form' })).toBe(form);
});

it('keeps the keyboard inside while it has the whole window', async () => {
  const user = userEvent.setup();
  render(whole(false));
  screen.getByRole('button', { name: 'Back' }).focus();
  for (let press = 0; press < 6; press++) {
    await user.tab();
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Behind' }));
  }
});

it('has no accessibility violations with the whole window', async () => {
  const { container } = render(whole(true));
  await expectAccessible(container);
});

it('has no accessibility violations', async () => {
  const { container } = render(example());
  await expectAccessible(container);
});
