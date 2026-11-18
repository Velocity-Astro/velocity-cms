import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { dismissToasts } from '@velocity/cms-ui';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AdminApp } from '../../app/AdminApp.js';
import { MemoryAdminClient } from '../../testing/memory-client.js';
import { renderApp } from '../../testing/render-app.js';
import { sampleContentTypes, sampleEntries, samplePage, samplePagesType, sampleUser } from '../../testing/sample-content.js';

const site = () => ({ user: sampleUser, contentTypes: [...sampleContentTypes, samplePagesType], entries: [...sampleEntries(), samplePage()] });
const frame = () => screen.findByTitle<HTMLIFrameElement>('Why list with us, as it would look');
/** The draft the form would send with its request for the page. */
const draft = () => JSON.parse(document.querySelector<HTMLInputElement>('input[name="draft"]')?.value ?? 'null') as { id: string; data: Record<string, unknown> };
/** What the page in the frame says to the editor. */
const say = async (data: unknown) => {
  const source = (await frame()).contentWindow;
  act(() => void window.dispatchEvent(new MessageEvent('message', { data, origin: window.location.origin, source })));
};

let submit: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  return act(() => dismissToasts());
});

it('shows a page beside the form that builds it, asked for at its own address with a preview link', async () => {
  renderApp('/content/pages/p1', site());
  const pane = within(await screen.findByRole('region', { name: 'The page' }));
  const page = await frame();
  expect(pane.getByText('The form as it is now, saved or not.')).toBeTruthy();
  const form = document.querySelector<HTMLFormElement>(`form[target="${page.name}"]`);
  expect(form?.getAttribute('action')).toMatch(/^\/why-list-with-us\/\?preview=\d+\.[0-9a-f]{64}$/);
  expect(submit).toHaveBeenCalledOnce();
  expect(draft().id).toBe('p1');
});

it('sends what is typed to the page without saving it', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/content/pages/p1', site());
  await frame();
  await user.click(await screen.findByRole('button', { name: /^Text/ }));
  await user.type(screen.getByRole('textbox', { name: 'Words' }), 'Typed, not saved');

  const body = draft().data['f-body'] as { data: Record<string, unknown> }[];
  expect(body[1]?.data['bf-text-body']).toBe('Typed, not saved');
  await waitFor(() => expect(submit.mock.calls.length).toBeGreaterThan(1));
  // The server still has what was saved.
  const saved = (await client.getEntry('p1')).data['f-body'] as { data: Record<string, unknown> }[];
  expect(saved[1]?.data).not.toHaveProperty('bf-text-body');
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
});

it('opens in the form the section pressed on the page', async () => {
  renderApp('/content/pages/p1', site());
  await frame();
  expect(screen.queryByRole('textbox', { name: 'Heading' })).toBeNull();
  await say({ source: 'velocity-cms', type: 'section', id: 's1' });
  expect((await screen.findByRole<HTMLInputElement>('textbox', { name: 'Heading' })).value).toBe('Sell for more, with less to do');
});

it('tries the page at a phone\'s and a tablet\'s width', async () => {
  const user = userEvent.setup();
  renderApp('/content/pages/p1', site());
  const page = await frame();
  const before = page.className;
  await user.click(screen.getByRole('radio', { name: 'Phone' }));
  expect(page.className).not.toBe(before);
  expect(screen.getByRole('radio', { name: 'Phone' }).getAttribute('aria-checked')).toBe('true');
});

it('says a new page must be saved once before it can be shown', async () => {
  renderApp('/content/pages/new', site());
  const pane = within(await screen.findByRole('region', { name: 'The page' }));
  expect(pane.getByText('Save the page once to see it here.')).toBeTruthy();
  expect(submit).not.toHaveBeenCalled();
});

it('says why when the site makes no previews, and keeps the form working', async () => {
  const client = new MemoryAdminClient(site());
  client.previewEntry = () => Promise.reject(new Error('This site has no previews, because it has no secret.'));
  render(<AdminApp client={client} siteName="Lakeshore" initialPath="/content/pages/p1" />);
  expect(await screen.findByText('The page cannot be shown here. This site has no previews, because it has no secret.')).toBeTruthy();
  expect(screen.getByRole('textbox', { name: 'Title' })).toBeTruthy();
});

it('shows no page beside an entry that is not built from sections', async () => {
  renderApp('/content/listings/e1', site());
  await screen.findByRole('textbox', { name: 'Title' });
  expect(screen.queryByRole('region', { name: 'The page' })).toBeNull();
});
