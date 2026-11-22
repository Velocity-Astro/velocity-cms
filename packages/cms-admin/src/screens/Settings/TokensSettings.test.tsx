import { act, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { dismissToasts } from '@velocity-astro/cms-ui';
import { afterEach, expect, it } from 'vitest';
import { renderApp } from '../../testing/render-app.js';
import { sampleContentTypes, sampleUser } from '../../testing/sample-content.js';

afterEach(() => act(() => dismissToasts()));

it('makes an access token for an agent, shows it once with the MCP address, and takes it away', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/settings/tokens', { user: sampleUser, contentTypes: sampleContentTypes });
  const card = within(await screen.findByRole('region', { name: 'Access tokens' }));
  expect(card.getByText('No tokens yet')).toBeTruthy();
  await user.click(card.getByRole('button', { name: 'Make a token' }));

  const dialog = within(await screen.findByRole('dialog', { name: 'Make an access token' }));
  await user.type(dialog.getByRole('textbox', { name: /What it is for/ }), 'Claude on my laptop');
  await user.click(dialog.getByRole('checkbox', { name: 'May publish' }));
  await user.click(dialog.getByRole('button', { name: 'Make token' }));

  const shown = within(await screen.findByRole('dialog', { name: 'Copy your token now' }));
  const secret = (shown.getByRole('textbox', { name: 'Token' }) as HTMLInputElement).value;
  expect(secret).toMatch(/^vcms_/);
  expect((shown.getByRole('textbox', { name: 'MCP address' }) as HTMLInputElement).value).toMatch(/\/api\/cms\/mcp$/);
  await user.click(shown.getByRole('button', { name: 'I have copied it' }));

  const row = within(await screen.findByRole('row', { name: /Claude on my laptop/ }));
  expect(row.getByText('Publishes')).toBeTruthy();
  expect(row.queryByText('Contacts and forms')).toBeNull();
  // Once the window is gone, the token is nowhere on the screen.
  expect(document.body.innerHTML).not.toContain(secret);

  await user.click(row.getByRole('button', { name: 'Take away Claude on my laptop' }));
  await user.click(await screen.findByRole('button', { name: 'Take it away' }));
  expect(await screen.findByText('Claude on my laptop was taken away')).toBeTruthy();
  expect(await client.listTokens()).toEqual([]);
});

it('puts what the server refuses on the field it is about', async () => {
  const user = userEvent.setup();
  renderApp('/settings/tokens', { user: sampleUser, contentTypes: sampleContentTypes });
  await user.click(await screen.findByRole('button', { name: 'Make a token' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Make an access token' }));
  await user.click(dialog.getByRole('button', { name: 'Make token' }));
  expect(await dialog.findByText(/Say what the token is for/)).toBeTruthy();
});
