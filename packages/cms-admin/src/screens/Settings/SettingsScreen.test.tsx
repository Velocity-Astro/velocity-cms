import { act, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { dismissToasts } from '@velocity-astro/cms-ui';
import { afterEach, expect, it } from 'vitest';
import { renderApp } from '../../testing/render-app.js';
import { sampleContentTypes, sampleUser } from '../../testing/sample-content.js';

const site = (changes: object = {}) => ({ user: sampleUser, contentTypes: sampleContentTypes, ...changes });
const card = async () => within(await screen.findByRole('region', { name: 'Email' }));

afterEach(() => act(() => dismissToasts()));

it('sets email up from the menu: a key that is never shown again, a sender, and a test to yourself', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/', site());
  await user.click(await screen.findByRole('link', { name: 'Settings' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'Email' }).getAttribute('aria-selected')).toBe('true');
  const email = await card();
  expect(email.getByText('Not set up')).toBeTruthy();
  expect(email.getByText(/sign-in links are printed in the server's log/)).toBeTruthy();
  expect(email.getByRole('button', { name: 'Send a test email' })).toHaveProperty('disabled', true);
  expect(email.getByRole('button', { name: 'Save email settings' })).toHaveProperty('disabled', true);
  expect(email.getByRole('link', { name: /Open your API keys at Resend/ }).getAttribute('href')).toBe('https://resend.com/api-keys');

  await user.type(email.getByLabelText(/^API key/), 're_live_123');
  await user.type(email.getByRole('textbox', { name: /^Sender/ }), 'Lakeshore <hello@lakeshore.example>');
  await user.click(email.getByRole('button', { name: 'Save email settings' }));
  expect(await screen.findByText('Email settings saved')).toBeTruthy();
  expect(await email.findByText('Sending')).toBeTruthy();
  // The key is gone from the screen, and nothing the server answers holds it.
  expect(email.queryByLabelText(/^API key/)).toBeNull();
  expect(email.getByText(/A key is saved/)).toBeTruthy();
  expect(document.body.innerHTML).not.toContain('re_live_123');
  expect(await client.getEmailSettings()).toMatchObject({ from: 'Lakeshore <hello@lakeshore.example>', hasKey: true, sending: true });

  expect(email.getByText(`A test goes to you, at ${sampleUser.email}, and to nobody else.`)).toBeTruthy();
  await user.click(email.getByRole('button', { name: 'Send a test email' }));
  expect(await screen.findByText('Test email sent')).toBeTruthy();
  expect(client.mail.tests).toEqual([sampleUser.id]);
});

it('puts what the server says on the field it is about, keeps what was typed, and says why a test failed', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/settings/email', site());
  const email = await card();
  await user.type(email.getByLabelText(/^API key/), 're_live_123');
  await user.type(email.getByRole('textbox', { name: /^Sender/ }), 'nobody');
  await user.click(email.getByRole('button', { name: 'Save email settings' }));
  expect(await email.findByText(/Give an address such as hello@example.com/)).toBeTruthy();
  expect(await screen.findByText('Email settings not saved')).toBeTruthy();
  expect(email.getByLabelText(/^API key/)).toHaveProperty('value', 're_live_123');

  await user.type(email.getByRole('textbox', { name: /^Sender/ }), '@lakeshore.example');
  await user.click(email.getByRole('button', { name: 'Save email settings' }));
  expect(await email.findByText('Sending')).toBeTruthy();
  client.mail.refuseWith = 'Resend did not accept the API key (401). Check that it was pasted whole.';
  await user.click(email.getByRole('button', { name: 'Send a test email' }));
  expect(await screen.findByText('Test email not sent')).toBeTruthy();
  expect(screen.getByText(/Resend did not accept the API key/)).toBeTruthy();
  expect(client.mail.tests).toEqual([]);
});

it('replaces a saved key, and stops sending only after asking', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/settings', site());
  await client.saveEmailSettings({ from: 'hello@lakeshore.example', apiKey: 're_old', expectedRevision: 0 });
  const email = await card();
  await user.click(await email.findByRole('button', { name: 'Replace the key' }));
  await user.click(email.getByRole('button', { name: 'Keep the saved key' }));
  expect(email.queryByLabelText(/^API key/)).toBeNull();
  await user.click(email.getByRole('button', { name: 'Replace the key' }));
  await user.type(email.getByLabelText(/^API key/), 're_new');
  expect(email.getByText('Save your changes before sending a test.')).toBeTruthy();
  expect(email.getByRole('button', { name: 'Send a test email' })).toHaveProperty('disabled', true);
  await user.click(email.getByRole('button', { name: 'Save email settings' }));
  await waitFor(async () => expect((await client.getEmailSettings()).revision).toBe(2));
  await waitFor(() => expect(email.queryByLabelText(/^API key/)).toBeNull());

  await user.click(email.getByRole('button', { name: 'Stop sending email' }));
  const ask = within(await screen.findByRole('alertdialog', { name: 'Stop sending email?' }));
  expect(ask.getByText(/Sign-in links will be printed in the server's log/)).toBeTruthy();
  await user.click(ask.getByRole('button', { name: 'Remove the key' }));
  expect(await screen.findByText('Email is no longer sent')).toBeTruthy();
  expect(await email.findByText('Not set up')).toBeTruthy();
  expect(await client.getEmailSettings()).toMatchObject({ hasKey: false, from: 'hello@lakeshore.example' });
});

it('says so when the server or the site\'s code decides, and offers no fields', async () => {
  renderApp('/settings/email', site({ emailFixedBy: 'server' }));
  const email = await card();
  expect(email.getByText('Set on the server')).toBeTruthy();
  expect(email.getByText(/VELOCITY_CMS_RESEND_API_KEY/)).toBeTruthy();
  expect(email.queryByRole('textbox', { name: /^Sender/ })).toBeNull();
  expect(email.getByRole('button', { name: 'Send a test email' })).toHaveProperty('disabled', false);
});

it('is for owners: an editor is shown no way there, and is refused at the address', async () => {
  renderApp('/settings/email', site({ user: { ...sampleUser, role: 'editor' } }));
  expect(await screen.findByText(/does not allow "settings:manage"/)).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull();
});
