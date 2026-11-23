import { act, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { dismissToasts } from '@velocity-astro/cms-ui';
import { afterEach, expect, it } from 'vitest';
import { renderApp } from '../../testing/render-app.js';
import { sampleBusiness, sampleBusinessType, sampleContentTypes, sampleUser } from '../../testing/sample-content.js';

const site = (changes: object = {}) => ({ user: sampleUser, contentTypes: sampleContentTypes, ...changes });
const card = async () => within(await screen.findByRole('region', { name: 'Email' }));

afterEach(() => act(() => dismissToasts()));

it('sets email up from the menu: a key that is never shown again, a sender, and a test to yourself', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/', site());
  await user.click(await screen.findByRole('link', { name: 'Settings' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'General' }).getAttribute('aria-selected')).toBe('true');
  await user.click(screen.getByRole('tab', { name: 'Email' }));
  const email = await card();
  expect(email.getByText('Not set up')).toBeTruthy();
  expect(email.getByText(/sign-in links are printed in the server's log/)).toBeTruthy();
  expect(email.getByRole('button', { name: 'Send a test email' })).toHaveProperty('disabled', true);
  expect(email.getByRole('button', { name: 'Save email settings' })).toHaveProperty('disabled', true);
  expect(email.getByRole('link', { name: /Open your API keys at Resend/ }).getAttribute('href')).toBe('https://resend.com/api-keys');

  await user.type(email.getByLabelText(/^API key/), 're_live_123');
  await user.type(email.getByRole('textbox', { name: /^Sender name/ }), 'Lakeshore');
  await user.type(email.getByRole('textbox', { name: /^Sender address/ }), 'hello@lakeshore.example');
  await user.click(email.getByRole('button', { name: 'Save email settings' }));
  expect(await screen.findByText('Email settings saved')).toBeTruthy();
  expect(await email.findByText('Sending')).toBeTruthy();
  // The key is gone from the screen, and nothing the server answers holds it.
  expect(email.queryByLabelText(/^API key/)).toBeNull();
  expect(email.getByText(/A key is saved/)).toBeTruthy();
  expect(document.body.innerHTML).not.toContain('re_live_123');
  expect(await client.getEmailSettings()).toMatchObject({ from: 'hello@lakeshore.example', senderName: 'Lakeshore', hasKey: true, sending: true });
  expect(email.getByText(/Emails wear your site's logo and brand colour/)).toBeTruthy();

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
  await user.type(email.getByRole('textbox', { name: /^Sender address/ }), 'nobody');
  await user.click(email.getByRole('button', { name: 'Save email settings' }));
  expect(await email.findByText(/Give an address such as hello@example.com/)).toBeTruthy();
  expect(await screen.findByText('Email settings not saved')).toBeTruthy();
  expect(email.getByLabelText(/^API key/)).toHaveProperty('value', 're_live_123');

  await user.type(email.getByRole('textbox', { name: /^Sender address/ }), '@lakeshore.example');
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
  const { client } = renderApp('/', site());
  await client.saveEmailSettings({ from: 'hello@lakeshore.example', apiKey: 're_old', expectedRevision: 0 });
  await user.click(await screen.findByRole('link', { name: 'Settings' }));
  await user.click(await screen.findByRole('tab', { name: 'Email' }));
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

it('says so when the server or the site\'s code decides, and offers only the sender\'s name where the server leaves it open', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/settings/email', site({ emailFixedBy: 'server' }));
  const email = await card();
  expect(email.getByText('Set on the server')).toBeTruthy();
  expect(email.getByText(/VELOCITY_CMS_RESEND_API_KEY/)).toBeTruthy();
  expect(email.queryByRole('textbox', { name: /^Sender address/ })).toBeNull();
  expect(email.getByRole('button', { name: 'Send a test email' })).toHaveProperty('disabled', false);
  await user.type(email.getByRole('textbox', { name: /^Sender name/ }), 'Lakeshore Realty');
  await user.click(email.getByRole('button', { name: 'Save sender name' }));
  expect(await screen.findByText('Email settings saved')).toBeTruthy();
  expect(await client.getEmailSettings()).toMatchObject({ senderName: 'Lakeshore Realty', from: '' });
});

it('offers no field at all when the site\'s code sends its own email', async () => {
  renderApp('/settings/email', site({ emailFixedBy: 'code' }));
  const email = await card();
  expect(email.getByText('Set in the site\'s code')).toBeTruthy();
  expect(email.queryByRole('textbox')).toBeNull();
});

it('names a bucket for uploads under Storage, tests it, and never shows the secret key again', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/settings', site());
  await user.click(await screen.findByRole('tab', { name: 'Storage' }));
  const uploads = within(await screen.findByRole('region', { name: 'Uploads' }));
  expect(uploads.getByText("Kept on the server's disk")).toBeTruthy();
  expect(uploads.getByRole('button', { name: 'Test the bucket' })).toHaveProperty('disabled', true);

  await user.type(uploads.getByRole('textbox', { name: /^Service address/ }), 'http://localhost');
  await user.type(uploads.getByRole('textbox', { name: /^Bucket name/ }), 'photos');
  await user.type(uploads.getByRole('textbox', { name: /^Access key ID/ }), 'AKIA123');
  await user.type(uploads.getByLabelText(/^Secret access key/), 'shh-secret');
  await user.click(uploads.getByRole('button', { name: 'Save storage settings' }));
  expect(await uploads.findByText(/Give the storage service's address, starting with https/)).toBeTruthy();
  expect(uploads.getByLabelText(/^Secret access key/)).toHaveProperty('value', 'shh-secret');

  await user.clear(uploads.getByRole('textbox', { name: /^Service address/ }));
  await user.type(uploads.getByRole('textbox', { name: /^Service address/ }), 'https://acct.r2.example.com');
  await user.click(uploads.getByRole('button', { name: 'Save storage settings' }));
  expect(await uploads.findByText('Kept in your bucket')).toBeTruthy();
  expect(uploads.queryByLabelText(/^Secret access key/)).toBeNull();
  expect(document.body.innerHTML).not.toContain('shh-secret');

  await user.click(uploads.getByRole('button', { name: 'Test the bucket' }));
  expect(await screen.findByText('The bucket works')).toBeTruthy();
  expect(client.storage.tests).toBe(1);
  client.storage.refuseWith = 'The storage service refused the keys (403).';
  await user.click(uploads.getByRole('button', { name: 'Test the bucket' }));
  expect(await screen.findByText('The bucket could not be used')).toBeTruthy();

  await user.click(uploads.getByRole('button', { name: 'Stop using this bucket' }));
  const ask = within(await screen.findByRole('alertdialog', { name: 'Stop using this bucket?' }));
  await user.click(ask.getByRole('button', { name: 'Remove the secret key' }));
  expect(await uploads.findByText("Kept on the server's disk")).toBeTruthy();
  expect(await client.getStorageSettings()).toMatchObject({ bucket: 'photos', hasSecret: false });
});

it('says who keeps uploads when the server or a host decides, and when the site takes none', async () => {
  const hosted = renderApp('/settings/storage', site({ storageFixedBy: 'host' }));
  const fixed = within(await screen.findByRole('region', { name: 'Uploads' }));
  expect(fixed.getByText('Handled by your host')).toBeTruthy();
  expect(fixed.queryByRole('textbox', { name: /^Bucket name/ })).toBeNull();
  hosted.unmount();

  renderApp('/settings/storage', site({ uploads: false }));
  const none = within(await screen.findByRole('region', { name: 'Uploads' }));
  expect(none.getByText('No uploads yet')).toBeTruthy();
  expect(none.getByText(/nowhere to keep uploads/)).toBeTruthy();
});

it('names the site under General, with what the server says on the field, and leaves it to a host that names its sites', async () => {
  const user = userEvent.setup();
  const first = renderApp('/settings', site());
  const name = within(await screen.findByRole('region', { name: 'Site name' }));
  const field = name.getByRole('textbox', { name: /^Site name/ });
  expect(field.getAttribute('placeholder')).toBe('Lakeshore Realty');
  expect(name.getByRole('button', { name: 'Save site name' })).toHaveProperty('disabled', true);
  await user.type(field, 'x'.repeat(81));
  await user.click(name.getByRole('button', { name: 'Save site name' }));
  expect(await name.findByText("Keep the site's name under 80 characters.")).toBeTruthy();
  await user.clear(field);
  await user.type(field, 'Oakhaven Homes');
  await user.click(name.getByRole('button', { name: 'Save site name' }));
  expect(await screen.findByText('Site name saved')).toBeTruthy();
  expect(await first.client.getGeneralSettings()).toMatchObject({ siteName: 'Oakhaven Homes', revision: 1 });
  first.unmount();

  renderApp('/settings/general', site({ siteNameFixedBy: 'host' }));
  const fixed = within(await screen.findByRole('region', { name: 'Site name' }));
  expect(fixed.getByText('Set by your host')).toBeTruthy();
  expect(fixed.queryByRole('textbox')).toBeNull();
});

it('sets up the spam check under Forms and spam, checks the keys, and never shows the secret key again', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/settings', site());
  await user.click(await screen.findByRole('tab', { name: 'Forms and spam' }));
  const check = within(await screen.findByRole('region', { name: 'Spam check' }));
  expect(check.getByText('No spam check')).toBeTruthy();
  expect(check.getByRole('button', { name: 'Check the keys' })).toHaveProperty('disabled', true);

  await user.type(check.getByLabelText(/^Secret key/), '0x4AAAAAAAsecretkey');
  await user.click(check.getByRole('button', { name: 'Save spam check' }));
  expect(await check.findByText(/Paste the site key too/)).toBeTruthy();
  expect(check.getByLabelText(/^Secret key/)).toHaveProperty('value', '0x4AAAAAAAsecretkey');

  await user.type(check.getByRole('textbox', { name: /^Site key/ }), '0x4AAAAAAAsitekey');
  await user.click(check.getByRole('button', { name: 'Save spam check' }));
  expect(await check.findByText('Checking senders')).toBeTruthy();
  expect(check.queryByLabelText(/^Secret key/)).toBeNull();
  expect(document.body.innerHTML).not.toContain('secretkey');

  await user.click(check.getByRole('button', { name: 'Check the keys' }));
  expect(await screen.findByText('Cloudflare knows the secret key')).toBeTruthy();
  expect(client.challenge.tests).toBe(1);
  client.challenge.refuseWith = 'Cloudflare does not know this secret key.';
  await user.click(check.getByRole('button', { name: 'Check the keys' }));
  expect(await screen.findByText('The keys could not be checked')).toBeTruthy();

  await user.click(check.getByRole('button', { name: 'Stop checking' }));
  const ask = within(await screen.findByRole('alertdialog', { name: 'Stop checking senders?' }));
  await user.click(ask.getByRole('button', { name: 'Remove the keys' }));
  expect(await check.findByText('No spam check')).toBeTruthy();
  expect(await client.getFormsSettings()).toMatchObject({ siteKey: '', hasSecret: false, checking: false });
});

it('switches the spam check to Google reCAPTCHA, which asks for its own secret key', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/settings', site());
  await client.saveFormsSettings({ siteKey: '0x4AAAAAAAsitekey', secretKey: '0x4AAAAAAAsecretkey', postsPerAddress: 8, expectedRevision: 0 });
  await user.click(await screen.findByRole('tab', { name: 'Forms and spam' }));
  const check = within(await screen.findByRole('region', { name: 'Spam check' }));
  expect(check.queryByLabelText(/^Secret key/)).toBeNull();

  await user.click(check.getByRole('radio', { name: 'Google reCAPTCHA v3' }));
  expect(check.getByText(/reCAPTCHA admin console/)).toBeTruthy();
  const siteKey = check.getByRole('textbox', { name: /^Site key/ });
  await user.clear(siteKey);
  await user.type(siteKey, '6LcAAAAAAAAAAAAAsitekey');
  await user.click(check.getByRole('button', { name: 'Save spam check' }));
  expect(await check.findByText(/The one saved is for Cloudflare/)).toBeTruthy();

  await user.type(check.getByLabelText(/^Secret key/), '6LcAAAAAAAAAAAAAsecretkey');
  await user.click(check.getByRole('button', { name: 'Save spam check' }));
  expect(await check.findByText('Checking senders')).toBeTruthy();
  expect(await client.getFormsSettings()).toMatchObject({ provider: 'recaptcha', siteKey: '6LcAAAAAAAAAAAAAsitekey', checking: true });
  await user.click(check.getByRole('button', { name: 'Check the keys' }));
  expect(await screen.findByText('Google knows the secret key')).toBeTruthy();
});

it('changes how much one address may send without touching the keys', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/settings', site());
  await client.saveFormsSettings({ siteKey: '0x4AAAAAAAsitekey', secretKey: '0x4AAAAAAAsecretkey', postsPerAddress: 8, expectedRevision: 0 });
  await user.click(await screen.findByRole('tab', { name: 'Forms and spam' }));
  const limit = within(await screen.findByRole('region', { name: 'Limit' }));
  const field = limit.getByRole('textbox', { name: /^Messages from one address/ });
  expect(limit.getByRole('button', { name: 'Save limit' })).toHaveProperty('disabled', true);
  await user.clear(field);
  await user.type(field, '25');
  await user.tab();
  await user.click(limit.getByRole('button', { name: 'Save limit' }));
  expect(await screen.findByText('Limit saved')).toBeTruthy();
  expect(await client.getFormsSettings()).toMatchObject({ checking: true, postsPerAddress: 25 });
});

const business = (changes: object = {}) => site({ contentTypes: [...sampleContentTypes, sampleBusinessType], entries: [sampleBusiness()], ...changes });

it('keeps a page of the settings as their first tab, out of the content, with one field for the name', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/', business());
  // One way to it in the menu, and no second field for what the site is called: not with the content.
  await user.click(await screen.findByRole('link', { name: 'Content' }));
  await screen.findByRole('link', { name: 'Listings' });
  expect(screen.queryByRole('link', { name: 'Business details' })).toBeNull();
  await user.click(screen.getByRole('link', { name: 'Settings' }));
  expect((await screen.findByRole('tab', { name: 'Business details' })).getAttribute('aria-selected')).toBe('true');
  expect(screen.queryByRole('tab', { name: 'General' })).toBeNull();
  expect(screen.getByRole('tab', { name: 'Email' })).toBeTruthy();
  expect(await screen.findByText(/Business name is also what this editor and the site's emails call the site/)).toBeTruthy();

  const name = await screen.findByRole('textbox', { name: /^Business name/ });
  expect(name).toHaveProperty('value', 'Lakeshore Realty');
  await user.clear(name);
  await user.type(name, 'Oakhaven Homes');
  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  await waitFor(async () => expect((await client.getEntry('b1')).data['f-business-name']).toBe('Oakhaven Homes'));
  // Saved is not published: the site keeps its name until someone says.
  expect((await client.getEntry('b1')).published?.data['f-business-name']).toBe('Lakeshore Realty');
  await user.click(screen.getByRole('button', { name: 'Publish changes' }));
  await waitFor(async () => expect((await client.getEntry('b1')).published?.data['f-business-name']).toBe('Oakhaven Homes'));

  await user.click(screen.getByRole('tab', { name: 'Email' }));
  expect(await screen.findByRole('region', { name: 'Email' })).toBeTruthy();
});

it('leads to the settings from the addresses such a page had among the content', async () => {
  renderApp('/content/business', business());
  expect((await screen.findByRole('tab', { name: 'Business details' })).getAttribute('aria-selected')).toBe('true');
  expect(await screen.findByRole('textbox', { name: /^Business name/ })).toBeTruthy();
});

it('opens the entry of such a page in the settings too', async () => {
  renderApp('/content/business/b1', business());
  expect((await screen.findByRole('tab', { name: 'Business details' })).getAttribute('aria-selected')).toBe('true');
});

it('starts a page of the settings that has nothing yet', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/settings', business({ entries: [] }));
  await user.type(await screen.findByRole('textbox', { name: /^Business name/ }), 'Oakhaven Homes');
  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  await waitFor(async () => expect((await client.listEntries({ type: 'business' })).items[0]?.data['f-business-name']).toBe('Oakhaven Homes'));
  // The form carries on with what was typed.
  expect(screen.getByRole('textbox', { name: /^Business name/ })).toHaveProperty('value', 'Oakhaven Homes');
});

it('shows an editor the pages of the settings and nothing an owner sets up', async () => {
  const editor = { ...sampleUser, role: 'editor' as const };
  const { unmount } = renderApp('/', business({ user: editor }));
  await userEvent.setup().click(await screen.findByRole('link', { name: 'Settings' }));
  expect(await screen.findByRole('textbox', { name: /^Business name/ })).toBeTruthy();
  expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Business details']);
  unmount();

  // With no such page there is nothing here for them, and the menu does not offer it.
  renderApp('/settings/email', site({ user: editor }));
  expect(await screen.findByText('Settings are for owners')).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull();
  expect(screen.queryByRole('tab')).toBeNull();
});
