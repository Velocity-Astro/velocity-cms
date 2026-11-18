import { render, screen, within } from '@testing-library/react';
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

it('has no accessibility violations', async () => {
  const { container } = render(example());
  await expectAccessible(container);
});
