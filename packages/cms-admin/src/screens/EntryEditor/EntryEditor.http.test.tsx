import { act, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { dismissToasts } from '@velocity-astro/cms-ui';
import { afterEach, expect, it } from 'vitest';
import { AdminApp } from '../../app/AdminApp.js';
import { createHttpServer } from '../../testing/http-server.js';
import { sampleContentTypes, sampleEntries, sampleUser } from '../../testing/sample-content.js';

afterEach(() => act(() => dismissToasts()));

it('edits and publishes an entry through the real API, with its refusals shown on the fields', async () => {
  const user = userEvent.setup();
  const { client } = await createHttpServer({ contentTypes: sampleContentTypes, entries: sampleEntries() }, sampleUser);
  render(<AdminApp client={client} siteName="Lakeshore" initialPath="/content/listings" />);

  await user.click(await screen.findByRole('rowheader', { name: /^Untitled/ }));
  await user.click(await screen.findByRole('button', { name: 'Publish' }));
  expect(await screen.findByText('Not published')).toBeTruthy();
  const title = await screen.findByRole('textbox', { name: /Title/ });
  expect(title.getAttribute('aria-invalid')).toBe('true');

  await user.type(title, '4 Elm Row');
  await user.click(screen.getByRole('button', { name: 'Publish' }));
  expect(await screen.findByText('Visitors can see it now.')).toBeTruthy();
  expect(await client.getEntry('e4')).toMatchObject({ status: 'published', published: { data: { 'f-title': '4 Elm Row' } } });

  await user.click(within(screen.getByRole('region', { name: 'Save and publish' })).getByRole('link', { name: 'Listings' }));
  expect(await screen.findByRole('rowheader', { name: /^4 Elm Row/ })).toBeTruthy();
});
