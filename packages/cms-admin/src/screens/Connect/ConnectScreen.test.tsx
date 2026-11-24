import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { leave } from '../../lib/leave.js';
import { SAMPLE_APP_QUERY } from '../../testing/memory-connections.js';
import { renderApp } from '../../testing/render-app.js';
import { sampleContentTypes, sampleUser } from '../../testing/sample-content.js';

const ASKED = `/connect?${SAMPLE_APP_QUERY}`;

afterEach(() => vi.restoreAllMocks());

it('asks an owner whether the app may connect, and sends them back to it with what they allowed', async () => {
  const user = userEvent.setup();
  const left = vi.spyOn(leave, 'to').mockImplementation(() => undefined);
  const { client } = renderApp(ASKED, { user: sampleUser, contentTypes: sampleContentTypes });
  expect(await screen.findByRole('heading', { level: 1, name: 'Connect Claude to Lakeshore Realty?' })).toBeTruthy();
  expect(screen.getByText(/You will be sent back to claude\.ai\./)).toBeTruthy();
  // What it may do starts at the least: drafts only, and no personal data.
  expect((screen.getByRole('checkbox', { name: 'May publish' }) as HTMLInputElement).checked).toBe(false);
  expect((screen.getByRole('checkbox', { name: /May read contacts/ }) as HTMLInputElement).checked).toBe(false);

  await user.click(screen.getByRole('checkbox', { name: 'May publish' }));
  await user.click(screen.getByRole('button', { name: 'Allow' }));
  await waitFor(() => expect(left).toHaveBeenCalledTimes(1));
  const back = new URL(left.mock.calls[0]?.[0] ?? '');
  expect(back.origin + back.pathname).toBe('https://claude.ai/api/mcp/auth_callback');
  expect(back.searchParams.get('code')).toBeTruthy();
  expect(back.searchParams.get('state')).toBe('sample-state');
  expect(await client.listConnections()).toMatchObject([{ name: 'Claude', role: 'editor', publish: true, personalData: false, connectedBy: 'Dana' }]);
});

it('tells the app when the person says no, and connects nothing', async () => {
  const user = userEvent.setup();
  const left = vi.spyOn(leave, 'to').mockImplementation(() => undefined);
  const { client } = renderApp(ASKED, { user: sampleUser, contentTypes: sampleContentTypes });
  await user.click(await screen.findByRole('button', { name: 'Don\'t allow' }));
  await waitFor(() => expect(left).toHaveBeenCalledTimes(1));
  expect(new URL(left.mock.calls[0]?.[0] ?? '').searchParams.get('error')).toBe('access_denied');
  expect(await client.listConnections()).toEqual([]);
});

it('has someone who is not signed in sign in first, and land on the question again', async () => {
  const user = userEvent.setup();
  const { client } = renderApp(ASKED);
  expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeTruthy();
  expect(screen.getByText(/Sign in to connect the app that sent you here/)).toBeTruthy();
  await user.type(screen.getByRole('textbox', { name: 'Email' }), 'dana@example.com');
  await user.click(screen.getByRole('button', { name: 'Email me a sign-in link' }));
  await screen.findByRole('heading', { level: 1, name: 'Check your email' });
  expect(client.linkLandings).toEqual([ASKED]);
});

it('goes on to the question after a passkey', async () => {
  const user = userEvent.setup();
  renderApp(ASKED, { passkeyUser: sampleUser, contentTypes: sampleContentTypes });
  await user.click(await screen.findByRole('button', { name: 'Sign in with a passkey' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Connect Claude to Lakeshore Realty?' })).toBeTruthy();
});

it('lands nowhere but the question from the sign-in screen', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/sign-in?next=%2F%2Fevil.test');
  await user.type(await screen.findByRole('textbox', { name: 'Email' }), 'dana@example.com');
  await user.click(screen.getByRole('button', { name: 'Email me a sign-in link' }));
  await screen.findByRole('heading', { level: 1, name: 'Check your email' });
  expect(client.linkLandings).toEqual([null]);
});

it('says why when the app is not known or the person is not an owner, with a way to the editor', async () => {
  const unknown = renderApp('/connect?client_id=nobody', { user: sampleUser, contentTypes: sampleContentTypes });
  expect(await screen.findByRole('heading', { level: 1, name: 'This app cannot be connected' })).toBeTruthy();
  expect(screen.getByText(/does not know the app that sent you here/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull();
  unknown.unmount();

  renderApp(ASKED, { user: { ...sampleUser, role: 'editor' }, contentTypes: sampleContentTypes });
  expect(await screen.findByText(/Only an owner of this site can connect an app/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Go to the editor' })).toBeTruthy();
});
