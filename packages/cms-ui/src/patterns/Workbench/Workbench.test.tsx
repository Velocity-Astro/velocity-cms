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

it('shows the outline on the left only when it has the whole window, and keeps the form as it is', () => {
  const withOutline = (view: 'beside' | 'whole') => (
    <Workbench paneLabel="The page" view={view} outline={<p>Every section</p>} outlineLabel="Sections of the page" pane={<p>What it makes</p>}>
      <button type="button">In the form</button>
    </Workbench>
  );
  const { rerender } = render(withOutline('beside'));
  const form = screen.getByRole('button', { name: 'In the form' });
  expect(screen.queryByRole('complementary', { name: 'Sections of the page' })).toBeNull();
  rerender(withOutline('whole'));
  const outline = screen.getByRole('complementary', { name: 'Sections of the page' });
  expect(within(outline).getByText('Every section')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'In the form' })).toBe(form);
  // The outline comes before the page, from left to right.
  expect(outline.compareDocumentPosition(screen.getByRole('region', { name: 'The page' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  rerender(withOutline('beside'));
  expect(screen.getByRole('button', { name: 'In the form' })).toBe(form);
});

it('is a studio in the dark theme with the whole window, whose columns are resized with the arrow keys', async () => {
  const user = userEvent.setup();
  const changes: { outline: number; form: number }[] = [];
  const { container } = render(
    <Workbench
      paneLabel="The page"
      view="whole"
      outline={<p>Every section</p>}
      outlineLabel="Sections of the page"
      resizeLabels={{ outline: 'Width of the sections', form: 'Width of the form' }}
      onSizesChange={(sizes) => changes.push(sizes)}
      pane={<p>What it makes</p>}
    >
      <p>In the form</p>
    </Workbench>,
  );
  expect(container.querySelector('.dark')).toBeTruthy();
  const form = screen.getByRole('separator', { name: 'Width of the form' });
  const before = Number(form.getAttribute('aria-valuenow'));
  form.focus();
  // The form's edge is on its left: moving it left makes the form wider.
  await user.keyboard('{ArrowLeft}');
  expect(screen.getByRole('separator', { name: 'Width of the form' }).getAttribute('aria-valuenow')).toBe(String(before + 1));
  const outline = screen.getByRole('separator', { name: 'Width of the sections' });
  outline.focus();
  await user.keyboard('{ArrowRight}');
  expect(changes.at(-1)).toEqual({ outline: Number(outline.getAttribute('aria-valuenow')), form: before + 1 });
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
