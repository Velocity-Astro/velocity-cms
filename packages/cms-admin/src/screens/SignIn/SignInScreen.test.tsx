import { screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { renderApp } from '../../testing/render-app.js';
import { sampleContentTypes, sampleUser } from '../../testing/sample-content.js';

it('sends anyone who is not signed in to the sign-in screen', async () => {
  renderApp('/content/listings');
  expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeTruthy();
  expect(screen.getByText('Lakeshore Realty')).toBeTruthy();
});

it('asks for a sign-in link and says to check email, without saying whether the address is known', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/sign-in');
  await user.type(await screen.findByRole('textbox', { name: 'Email' }), ' dana@example.com ');
  await user.click(screen.getByRole('button', { name: 'Email me a sign-in link' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Check your email' })).toBeTruthy();
  expect(screen.getByText(/If dana@example.com belongs to someone on this site/)).toBeTruthy();
  expect(client.linkRequests).toEqual(['dana@example.com']);
});

it('explains a missing or malformed address on the field, and sends nothing', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/sign-in');
  await user.click(await screen.findByRole('button', { name: 'Email me a sign-in link' }));
  expect(screen.getByText('Enter your email address.')).toBeTruthy();
  await user.type(screen.getByRole('textbox', { name: 'Email' }), 'dana');
  await user.keyboard('{Enter}');
  expect(screen.getByText('Enter an email address, such as name@example.com.')).toBeTruthy();
  expect(screen.getByRole('textbox', { name: 'Email' }).getAttribute('aria-invalid')).toBe('true');
  expect(client.linkRequests).toEqual([]);
});

it('lets someone go back and use a different address', async () => {
  const user = userEvent.setup();
  renderApp('/sign-in');
  await user.type(await screen.findByRole('textbox', { name: 'Email' }), 'dana@example.com{Enter}');
  await user.click(await screen.findByRole('button', { name: 'Use a different email' }));
  expect(screen.getByRole('textbox', { name: 'Email' })).toBeTruthy();
});

it('shows what the server said when the link could not be sent', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/sign-in');
  const field = await screen.findByRole('textbox', { name: 'Email' });
  client.failNextWith = 'Too many attempts. Wait a minute and try again.';
  await user.type(field, 'dana@example.com{Enter}');
  expect(await screen.findByText('Too many attempts. Wait a minute and try again.')).toBeTruthy();
});

it('signs in with a passkey and opens the editor', async () => {
  const user = userEvent.setup();
  renderApp('/sign-in', { passkeyUser: sampleUser, contentTypes: sampleContentTypes });
  await user.click(await screen.findByRole('button', { name: 'Sign in with a passkey' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Agents' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Signed in as Dana' })).toBeTruthy();
});

it('says so when the passkey does not work, and stays on the screen', async () => {
  const user = userEvent.setup();
  renderApp('/sign-in');
  await user.click(await screen.findByRole('button', { name: 'Sign in with a passkey' }));
  expect(await screen.findByText('The passkey did not work. Try again, or use a sign-in link instead.')).toBeTruthy();
});

it('skips the sign-in screen for someone already signed in', async () => {
  renderApp('/sign-in', { user: sampleUser, contentTypes: sampleContentTypes });
  expect(await screen.findByRole('heading', { level: 1, name: 'Agents' })).toBeTruthy();
});
