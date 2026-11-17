import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { AuthShell } from './AuthShell.js';

it('draws the form in the page\'s main area, under a level 1 heading', () => {
  render(
    <AuthShell brand="Lakeshore Realty" title="Sign in" description="Use a passkey.">
      The form
    </AuthShell>,
  );
  const main = screen.getByRole('main');
  expect(within(main).getByRole('heading', { level: 1, name: 'Sign in' })).toBeTruthy();
  expect(main.textContent).toContain('Lakeshore Realty');
  expect(main.textContent).toContain('Use a passkey.');
  expect(main.textContent).toContain('The form');
});

it('has no accessibility violations', async () => {
  const { container } = render(
    <AuthShell brand="Lakeshore Realty" title="Sign in" footer="No password needed.">
      The form
    </AuthShell>,
  );
  await expectAccessible(container);
});
