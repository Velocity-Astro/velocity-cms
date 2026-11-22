import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { dismissToasts } from '@velocity-astro/cms-ui';
import { afterEach, expect, it } from 'vitest';
import { AdminApp } from '../../app/AdminApp.js';
import { renderApp } from '../../testing/render-app.js';
import { sampleContentTypes, sampleUser } from '../../testing/sample-content.js';

const site = { user: sampleUser, contentTypes: sampleContentTypes };
const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==';

afterEach(() => act(() => dismissToasts()));

it('is reached from the account menu, and changes your name everywhere it is shown', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/', site);
  await user.click((await screen.findAllByRole('button', { name: /^Account/ }))[0] as HTMLElement);
  await user.click(await screen.findByRole('menuitem', { name: 'Your profile' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Your profile' })).toBeTruthy();
  expect(screen.getByText(`You sign in as ${sampleUser.email}.`)).toBeTruthy();
  const details = within(screen.getByRole('region', { name: 'Your details' }));
  const name = details.getByRole('textbox', { name: /^Name/ });
  expect(details.getByRole('button', { name: 'Save details' })).toHaveProperty('disabled', true);
  await user.clear(name);
  await user.type(name, 'Dana Whitfield');
  await user.click(details.getByRole('button', { name: 'Save details' }));
  expect(await screen.findByText('Details saved')).toBeTruthy();
  expect((await client.getProfile()).name).toBe('Dana Whitfield');
  await waitFor(() => expect(screen.getAllByText('Dana Whitfield').length).toBeGreaterThan(0));
});

it('shows your photo and takes it away', async () => {
  const user = userEvent.setup();
  const me = { ...sampleUser, image: photo };
  const { client } = renderApp('/profile', { ...site, user: me, people: [me] });
  const details = within(await screen.findByRole('region', { name: 'Your details' }));
  await user.click(await details.findByRole('button', { name: 'Remove photo' }));
  expect(await screen.findByText('Photo removed')).toBeTruthy();
  expect(await details.findByRole('button', { name: 'Upload a photo' })).toBeTruthy();
  expect(await client.getProfile()).not.toHaveProperty('image');
});

it('changes your address only once the link sent to it is opened, signed in', async () => {
  const user = userEvent.setup();
  const { client, unmount } = renderApp('/profile', site);
  const email = within(await screen.findByRole('region', { name: 'Email address' }));
  await user.click(email.getByRole('button', { name: 'Change email address' }));
  await user.type(email.getByRole('textbox', { name: /^New email address/ }), 'nope');
  await user.click(email.getByRole('button', { name: 'Send link' }));
  expect(await email.findByText(/Enter an email address/)).toBeTruthy();
  await user.clear(email.getByRole('textbox', { name: /^New email address/ }));
  await user.type(email.getByRole('textbox', { name: /^New email address/ }), 'dana@new.example');
  await user.click(email.getByRole('button', { name: 'Send link' }));
  expect(await screen.findByText('Check your new inbox')).toBeTruthy();
  expect((await client.getProfile()).email).toBe(sampleUser.email);
  unmount();
  act(() => dismissToasts());

  // The link opens the profile, signed in, and the address is changed there, once.
  render(<AdminApp client={client} siteName="Lakeshore Realty" initialPath={`/profile?email=${client.lastEmailToken ?? ''}`} />);
  expect(await screen.findByText('Email address changed')).toBeTruthy();
  expect(await screen.findByText('You sign in as dana@new.example.')).toBeTruthy();
  expect((await client.getProfile()).email).toBe('dana@new.example');
});
