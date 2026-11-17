import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Button } from '../../components/Button/index.js';
import { expectAccessible } from '../../testing/accessible.js';
import { SaveBar } from './SaveBar.js';

const example = <SaveBar label="Save and publish" status="Saved 2 minutes ago" actions={<Button>Publish</Button>} />;

it('is a named region holding the status and the buttons', () => {
  render(example);
  const bar = screen.getByRole('region', { name: 'Save and publish' });
  expect(bar.textContent).toContain('Saved 2 minutes ago');
  expect(within(bar).getByRole('button', { name: 'Publish' })).toBeTruthy();
});

it('announces its status when it changes, without moving focus', () => {
  render(example);
  expect(screen.getByText('Saved 2 minutes ago').getAttribute('aria-live')).toBe('polite');
});

it('has no accessibility violations', async () => {
  const { container } = render(example);
  await expectAccessible(container);
});
