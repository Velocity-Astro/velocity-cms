import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { dismissToasts } from '@velocity-astro/cms-ui';
import type { BlockDef, BlockValue, FieldDef } from '@velocity-astro/cms-core';
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
  expect(pane.getByRole('button', { name: 'Visual editor' })).toBeTruthy();
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

it('opens the section and points at the field pressed on the page, until the person turns elsewhere', async () => {
  const user = userEvent.setup();
  renderApp('/content/pages/p1', site());
  await frame();
  await say({ source: 'velocity-cms', type: 'section', id: 's1', field: 'text' });
  const line = await screen.findByRole('textbox', { name: 'Line under it' });
  await waitFor(() => expect(line.closest('[data-lit]')).not.toBeNull());
  expect(screen.getByRole('textbox', { name: 'Heading' }).closest('[data-lit]')).toBeNull();
  // What was typed stays where it was typed: pointing draws no field anew.
  await user.type(line, ' Always.');
  await say({ source: 'velocity-cms', type: 'section', id: 's1', field: 'title' });
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Heading' }).closest('[data-lit]')).not.toBeNull());
  expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Line under it' }).value).toMatch(/Always\.$/);
});

it('tells the page where words may be typed, and puts in the form what is typed there without drawing the page again', async () => {
  renderApp('/content/pages/p1', site());
  const page = await frame();
  const post = vi.spyOn(page.contentWindow as Window, 'postMessage').mockImplementation(() => undefined);
  await say({ source: 'velocity-cms', type: 'ready' });
  const told = post.mock.calls.map(([message]) => message as { type: string; places?: Record<string, string[]> }).filter((message) => message.type === 'typable').at(-1);
  // Plain words can be typed on the page, an empty field of them too; nothing is said of a section's choices.
  expect(told?.places?.['s1']).toEqual(['title', 'text']);
  expect(told?.places?.['s2']).toEqual(['title', 'body']);

  const asked = submit.mock.calls.length;
  // Two fields in one breath: neither is lost to the other.
  const source = page.contentWindow;
  act(() => {
    for (const [field, words] of [['title', 'Sell for more'], ['text', 'One agent.']])
      window.dispatchEvent(new MessageEvent('message', { data: { source: 'velocity-cms', type: 'words', id: 's1', field, words }, origin: window.location.origin, source }));
  });
  const hero = () => (draft().data['f-body'] as { data: Record<string, unknown> }[])[0]?.data;
  expect(hero()).toEqual({ 'bf-hero-title': 'Sell for more', 'bf-hero-text': 'One agent.' });
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
  // Emptied on the page, the field is empty in the form, and can be typed into again.
  await say({ source: 'velocity-cms', type: 'words', id: 's1', field: 'text', words: '' });
  expect(hero()).toEqual({ 'bf-hero-title': 'Sell for more' });
  await say({ source: 'velocity-cms', type: 'words', id: 's1', field: 'text', words: 'Back.' });
  expect(hero()?.['bf-hero-text']).toBe('Back.');
  // A place the form does not know changes nothing.
  await say({ source: 'velocity-cms', type: 'words', id: 's1', field: 'nowhere', words: 'x' });
  await say({ source: 'velocity-cms', type: 'words', id: 'gone', field: 'title', words: 'x' });
  expect(hero()).toEqual({ 'bf-hero-title': 'Sell for more', 'bf-hero-text': 'Back.' });
  await new Promise((done) => setTimeout(done, 700));
  expect(submit.mock.calls.length).toBe(asked);
});

it('opens the section alone when the field pressed is not one the form has', async () => {
  renderApp('/content/pages/p1', site());
  await frame();
  await say({ source: 'velocity-cms', type: 'section', id: 's2', field: 'nowhere.0.x' });
  expect(await screen.findByRole('textbox', { name: 'Words' })).toBeTruthy();
  expect(document.querySelector('[data-lit]')).toBeNull();
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

it('gives the page the whole window, and brings the form back for what cannot be typed on the page', async () => {
  const user = userEvent.setup();
  renderApp('/content/pages/p1', site());
  const page = await frame();
  await user.click(screen.getByRole('button', { name: 'Visual editor' }));
  // The same page, not a new one: nothing is asked for again.
  expect(await frame()).toBe(page);
  expect(submit).toHaveBeenCalledOnce();
  // One bar, with the way back, the widths and the save buttons.
  const bar = within(screen.getByRole('region', { name: 'Save and publish' }));
  expect(bar.getByRole('radio', { name: 'Tablet' })).toBeTruthy();
  expect(bar.getByRole('button', { name: 'Save draft' })).toBeTruthy();
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'Visual editor' })).toBeNull();

  // Words that can be typed on the page leave the form where it is.
  expect(bar.getByRole('button', { name: 'Show the form' })).toBeTruthy();
  await say({ source: 'velocity-cms', type: 'ready' });
  await say({ source: 'velocity-cms', type: 'section', id: 's1', field: 'title' });
  expect(bar.getByRole('button', { name: 'Show the form' })).toBeTruthy();
  // A section, or a field edited only in the form, brings the form.
  await say({ source: 'velocity-cms', type: 'section', id: 's1' });
  expect(await bar.findByRole('button', { name: 'Hide the form' })).toBeTruthy();
  await user.click(bar.getByRole('button', { name: 'Hide the form' }));
  expect(bar.getByRole('button', { name: 'Show the form' })).toBeTruthy();

  // What is typed here is the form's, and is still there on the way back.
  await say({ source: 'velocity-cms', type: 'words', id: 's1', field: 'title', words: 'Typed in the window' });
  await user.click(bar.getByRole('button', { name: 'Back to the form' }));
  expect(await screen.findByRole('button', { name: 'Visual editor' })).toBeTruthy();
  expect(await frame()).toBe(page);
  expect((draft().data['f-body'] as { data: Record<string, unknown> }[])[0]?.data['bf-hero-title']).toBe('Typed in the window');
});

it('does on the form what a section\'s bar on the page asks for', async () => {
  const user = userEvent.setup();
  renderApp('/content/pages/p1', site());
  const page = await frame();
  const post = vi.spyOn(page.contentWindow as Window, 'postMessage').mockImplementation(() => undefined);
  await say({ source: 'velocity-cms', type: 'ready' });
  const told = post.mock.calls.map(([message]) => message as { type: string; sections?: Record<string, { name: string; up: boolean; down: boolean }> }).find((message) => message.type === 'tools');
  expect(told?.sections?.['s1']).toMatchObject({ up: false, down: true });
  const order = () => (draft().data['f-body'] as { id: string; block: string }[]).map((section) => section.id);
  const first = order();

  await say({ source: 'velocity-cms', type: 'act', id: 's1', action: 'down' });
  expect(order()).toEqual([first[1], first[0], ...first.slice(2)]);
  await say({ source: 'velocity-cms', type: 'act', id: 's1', action: 'up' });
  expect(order()).toEqual(first);
  // The first cannot go further up, whatever the page says.
  await say({ source: 'velocity-cms', type: 'act', id: 's1', action: 'up' });
  expect(order()).toEqual(first);

  await say({ source: 'velocity-cms', type: 'act', id: 's1', action: 'duplicate' });
  expect(order()).toHaveLength(first.length + 1);
  expect(order()[0]).toBe('s1');
  expect(order()[2]).toBe(first[1]);

  // A new section goes where the button was: above the first.
  await say({ source: 'velocity-cms', type: 'act', id: 's1', action: 'addBefore' });
  await user.click(await screen.findByRole('option', { name: /^Text/ }));
  await waitFor(() => expect(order()).toHaveLength(first.length + 2));
  expect(order()[1]).toBe('s1');

  // A section that holds something is removed only after a yes.
  await say({ source: 'velocity-cms', type: 'act', id: 's1', action: 'remove' });
  const sure = within(await screen.findByRole('alertdialog'));
  await user.click(sure.getAllByRole('button').at(-1) as HTMLElement);
  await waitFor(() => expect(order()).not.toContain('s1'));
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
});

it('puts a section dragged on the page where it was let go', async () => {
  renderApp('/content/pages/p1', site());
  await frame();
  const order = () => (draft().data['f-body'] as { id: string }[]).map((section) => section.id);
  const [first, second, ...rest] = order();
  // To the end.
  await say({ source: 'velocity-cms', type: 'move', id: first, before: null });
  expect(order()).toEqual([second, ...rest, first]);
  // Back before the one that is now first.
  await say({ source: 'velocity-cms', type: 'move', id: first, before: second });
  expect(order()).toEqual([first, second, ...rest]);
  // Where it already is, and sections the form does not have, change nothing.
  await say({ source: 'velocity-cms', type: 'move', id: first, before: second });
  await say({ source: 'velocity-cms', type: 'move', id: 'gone', before: null });
  await say({ source: 'velocity-cms', type: 'move', id: first, before: 'gone' });
  expect(order()).toEqual([first, second, ...rest]);
});

it('offers the whole window only once there is a page to show', async () => {
  renderApp('/content/pages/new', site());
  const pane = within(await screen.findByRole('region', { name: 'The page' }));
  expect(pane.getByRole('button', { name: 'Visual editor' }).hasAttribute('disabled')).toBe(true);
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

it('changes a picture from the page: the button on it opens the window the image is chosen in', async () => {
  const user = userEvent.setup();
  // The page's opening gains a photo, and a list of people each with a portrait.
  const photo: FieldDef = { id: 'bf-hero-photo', key: 'photo', type: 'image', label: { en: 'Photo' }, required: false, translated: false, options: {} };
  const person: FieldDef = { ...photo, id: 'bf-person-portrait', key: 'portrait', label: { en: 'Portrait' } };
  const people: FieldDef = { ...photo, id: 'bf-hero-people', key: 'people', type: 'list', label: { en: 'People' }, options: { of: { type: 'group', options: { fields: [person] } } } };
  const fields = samplePagesType.fields.map((field) =>
    field.id === 'f-body'
      ? { ...field, options: { ...field.options, blocks: (field.options['blocks'] as BlockDef[]).map((block) => (block.id === 'b-hero' ? { ...block, fields: [...block.fields, photo, people] } : block)) } }
      : field,
  );
  const page = samplePage();
  const body = (page.data['f-body'] as BlockValue[]).map((section) => (section.id === 's1' ? { ...section, data: { ...section.data, 'bf-hero-people': [{ 'bf-person-portrait': 'porch' }] } } : section));
  const image = (name: string) => ({ name, url: `/images/${name}.webp`, width: 1200, height: 800 });
  renderApp('/content/pages/p1', {
    user: sampleUser,
    contentTypes: [...sampleContentTypes, { ...samplePagesType, fields }],
    entries: [...sampleEntries(), { ...page, data: { ...page.data, 'f-body': body } }],
    images: [image('porch'), image('kitchen')],
  });
  const shown = await frame();
  const post = vi.spyOn(shown.contentWindow as Window, 'postMessage').mockImplementation(() => undefined);
  await say({ source: 'velocity-cms', type: 'ready' });
  const told = post.mock.calls.map(([message]) => message as { type: string; labels?: { picture?: string }; sections?: Record<string, { pictures?: string[] }> }).find((message) => message.type === 'tools');
  expect(told?.labels?.picture).toBe('Change image');
  expect(told?.sections?.['s1']?.pictures).toEqual(['photo', 'people.0.portrait']);
  expect(told?.sections?.['s2']?.pictures).toEqual([]);
  const hero = () => (draft().data['f-body'] as BlockValue[])[0]?.data ?? {};

  await say({ source: 'velocity-cms', type: 'picture', id: 's1', field: 'photo' });
  await user.click(within(await screen.findByRole('dialog', { name: 'Choose an image' })).getByRole('option', { name: 'kitchen' }));
  await waitFor(() => expect(hero()['bf-hero-photo']).toBe('kitchen'));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose an image' })).toBeNull());

  // One inside a list is changed where it is, and the one that is chosen now is marked.
  await say({ source: 'velocity-cms', type: 'picture', id: 's1', field: 'people.0.portrait' });
  const again = within(await screen.findByRole('dialog', { name: 'Choose an image' }));
  expect(again.getByRole('option', { name: 'porch' }).getAttribute('aria-selected')).toBe('true');
  await user.click(again.getByRole('option', { name: 'kitchen' }));
  await waitFor(() => expect(hero()['bf-hero-people']).toEqual([{ 'bf-person-portrait': 'kitchen' }]));
  expect(screen.getByText('Unsaved changes')).toBeTruthy();

  // A place the form does not have opens nothing.
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose an image' })).toBeNull());
  await say({ source: 'velocity-cms', type: 'picture', id: 's1', field: 'gone' });
  await say({ source: 'velocity-cms', type: 'picture', id: 'gone', field: 'photo' });
  expect(screen.queryByRole('dialog', { name: 'Choose an image' })).toBeNull();
});

it('edits a link from the page: the button on it opens a window that holds the link\'s own field', async () => {
  const user = userEvent.setup();
  // The page's opening gains a button, and a list of cards each with a link.
  const to: FieldDef = { id: 'bf-hero-to', key: 'buttonTo', type: 'link', label: { en: 'Button leads to' }, required: false, translated: false, options: {} };
  const cardTo: FieldDef = { ...to, id: 'bf-card-to', key: 'to', label: { en: 'Card leads to' } };
  const cards: FieldDef = { ...to, id: 'bf-hero-cards', key: 'cards', type: 'list', label: { en: 'Cards' }, options: { of: { type: 'group', options: { fields: [cardTo] } } } };
  const fields = samplePagesType.fields.map((field) =>
    field.id === 'f-body'
      ? { ...field, options: { ...field.options, blocks: (field.options['blocks'] as BlockDef[]).map((block) => (block.id === 'b-hero' ? { ...block, fields: [...block.fields, to, cards] } : block)) } }
      : field,
  );
  const page = samplePage();
  const body = (page.data['f-body'] as BlockValue[]).map((section) =>
    section.id === 's1' ? { ...section, data: { ...section.data, 'bf-hero-to': { kind: 'address', href: '/menu/' }, 'bf-hero-cards': [{ 'bf-card-to': { kind: 'address', href: '/visit/' } }] } } : section,
  );
  renderApp('/content/pages/p1', {
    user: sampleUser,
    contentTypes: [...sampleContentTypes, { ...samplePagesType, fields }],
    entries: [...sampleEntries(), { ...page, data: { ...page.data, 'f-body': body } }],
  });
  const shown = await frame();
  const post = vi.spyOn(shown.contentWindow as Window, 'postMessage').mockImplementation(() => undefined);
  await say({ source: 'velocity-cms', type: 'ready' });
  const told = post.mock.calls.map(([message]) => message as { type: string; labels?: { link?: string }; sections?: Record<string, { links?: string[] }> }).find((message) => message.type === 'tools');
  expect(told?.labels?.link).toBe('Edit link');
  expect(told?.sections?.['s1']?.links).toEqual(['buttonTo', 'cards.0.to']);
  expect(told?.sections?.['s2']?.links).toEqual([]);
  const hero = () => (draft().data['f-body'] as BlockValue[])[0]?.data ?? {};

  await say({ source: 'velocity-cms', type: 'link', id: 's1', field: 'buttonTo' });
  const window = within(await screen.findByRole('dialog', { name: 'Edit link' }));
  const address = window.getByRole('textbox', { name: 'Address' });
  expect((address as HTMLInputElement).value).toBe('/menu/');
  await user.clear(address);
  await user.type(address, '/book/');
  await waitFor(() => expect(hero()['bf-hero-to']).toEqual({ kind: 'address', href: '/book/' }));
  await user.click(window.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit link' })).toBeNull());
  expect(screen.getByText('Unsaved changes')).toBeTruthy();

  // One inside a list is changed where it is.
  await say({ source: 'velocity-cms', type: 'link', id: 's1', field: 'cards.0.to' });
  const again = within(await screen.findByRole('dialog', { name: 'Edit link' }));
  const inner = again.getByRole('textbox', { name: 'Address' });
  expect((inner as HTMLInputElement).value).toBe('/visit/');
  await user.type(inner, 'us/');
  await waitFor(() => expect(hero()['bf-hero-cards']).toEqual([{ 'bf-card-to': { kind: 'address', href: '/visit/us/' } }]));
  await user.click(again.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit link' })).toBeNull());

  // A place the form does not have opens nothing.
  await say({ source: 'velocity-cms', type: 'link', id: 's1', field: 'gone' });
  await say({ source: 'velocity-cms', type: 'link', id: 'gone', field: 'buttonTo' });
  expect(screen.queryByRole('dialog', { name: 'Edit link' })).toBeNull();
});

it('moves, copies and removes an item of a list from the page', async () => {
  const name: FieldDef = { id: 'bf-card-name', key: 'name', type: 'text', label: { en: 'Name' }, required: false, translated: false, options: {} };
  const cards: FieldDef = { ...name, id: 'bf-hero-cards', key: 'cards', type: 'list', label: { en: 'Cards' }, options: { max: 3, of: { type: 'group', options: { fields: [name] } } } };
  const fields = samplePagesType.fields.map((field) =>
    field.id === 'f-body'
      ? { ...field, options: { ...field.options, blocks: (field.options['blocks'] as BlockDef[]).map((block) => (block.id === 'b-hero' ? { ...block, fields: [...block.fields, cards] } : block)) } }
      : field,
  );
  const page = samplePage();
  const card = (words: string) => ({ 'bf-card-name': words });
  const body = (page.data['f-body'] as BlockValue[]).map((section) => (section.id === 's1' ? { ...section, data: { ...section.data, 'bf-hero-cards': [card('Soup'), card('Bread')] } } : section));
  renderApp('/content/pages/p1', {
    user: sampleUser,
    contentTypes: [...sampleContentTypes, { ...samplePagesType, fields }],
    entries: [...sampleEntries(), { ...page, data: { ...page.data, 'f-body': body } }],
  });
  const shown = await frame();
  const post = vi.spyOn(shown.contentWindow as Window, 'postMessage').mockImplementation(() => undefined);
  await say({ source: 'velocity-cms', type: 'ready' });
  type Told = { type: string; labels?: Record<string, string>; sections?: Record<string, { lists?: unknown }> };
  const told = () => post.mock.calls.map(([message]) => message as Told).filter((message) => message.type === 'tools').at(-1);
  expect(told()?.labels?.['itemUp']).toBe('Move earlier');
  expect(told()?.sections?.['s1']?.lists).toEqual([{ field: 'cards', count: 2, full: false }]);
  const held = () => ((draft().data['f-body'] as BlockValue[])[0]?.data['bf-hero-cards'] as { 'bf-card-name': string }[] | undefined)?.map((item) => item['bf-card-name']);
  const item = (at: number, action: string) => say({ source: 'velocity-cms', type: 'item', id: 's1', field: 'cards', at, action });

  await item(1, 'up');
  await waitFor(() => expect(held()).toEqual(['Bread', 'Soup']));
  await item(0, 'duplicate');
  await waitFor(() => expect(held()).toEqual(['Bread', 'Bread', 'Soup']));
  // A full list takes no copy, whatever the page says, and the page is told it is full.
  await waitFor(() => expect(told()?.sections?.['s1']?.lists).toEqual([{ field: 'cards', count: 3, full: true }]));
  await item(0, 'duplicate');
  await item(0, 'up');
  await item(2, 'down');
  await item(7, 'remove');
  await say({ source: 'velocity-cms', type: 'item', id: 's1', field: 'gone', at: 0, action: 'remove' });
  await say({ source: 'velocity-cms', type: 'item', id: 's1', field: 'cards', at: 0, action: 'explode' });
  expect(held()).toEqual(['Bread', 'Bread', 'Soup']);
  await item(1, 'remove');
  await waitFor(() => expect(held()).toEqual(['Bread', 'Soup']));
  await item(0, 'remove');
  await item(0, 'remove');
  await waitFor(() => expect(held()).toBeUndefined());
  expect(screen.getByText('Unsaved changes')).toBeTruthy();
});

it('takes shaped text written on the page into the form, and asks where a link there should lead', async () => {
  const user = userEvent.setup();
  const story: FieldDef = { id: 'bf-hero-story', key: 'story', type: 'richtext', label: { en: 'Story' }, required: false, translated: false, options: {} };
  const fields = samplePagesType.fields.map((field) =>
    field.id === 'f-body'
      ? { ...field, options: { ...field.options, blocks: (field.options['blocks'] as BlockDef[]).map((block) => (block.id === 'b-hero' ? { ...block, fields: [...block.fields, story] } : block)) } }
      : field,
  );
  renderApp('/content/pages/p1', { user: sampleUser, contentTypes: [...sampleContentTypes, { ...samplePagesType, fields }], entries: [...sampleEntries(), samplePage()] });
  const shown = await frame();
  const post = vi.spyOn(shown.contentWindow as Window, 'postMessage').mockImplementation(() => undefined);
  await say({ source: 'velocity-cms', type: 'ready' });
  const told = post.mock.calls.map(([message]) => message as { type: string; places?: Record<string, string[]> }).filter((message) => message.type === 'typable').at(-1);
  expect(told?.places?.['s1']).toContain('story');

  // What the page says is its markup: only what the format keeps reaches the form.
  await say({ source: 'velocity-cms', type: 'words', id: 's1', field: 'story', words: '<p>One <b>bold</b> <a href="/visit/">link</a> <a href="javascript:x()">bad</a></p><div onclick="x()">Two</div>' });
  const hero = () => (draft().data['f-body'] as BlockValue[])[0]?.data ?? {};
  await waitFor(() =>
    expect(hero()['bf-hero-story']).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'One ' },
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' ' },
            { type: 'text', text: 'link', marks: [{ type: 'link', attrs: { href: '/visit/' } }] },
            { type: 'text', text: ' bad' },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'Two' }] },
      ],
    }),
  );
  await say({ source: 'velocity-cms', type: 'words', id: 's1', field: 'story', words: '<p><br></p>' });
  await waitFor(() => expect(hero()['bf-hero-story']).toBeUndefined());

  // The page asks where a link leads; the person is asked here and the page is answered.
  const answers = () => post.mock.calls.map(([message]) => message as { type: string; href?: string | null }).filter((message) => message.type === 'linkAnswer');
  await say({ source: 'velocity-cms', type: 'linkAsk', id: 's1', field: 'story', href: '' });
  const asked = within(await screen.findByRole('dialog', { name: 'Link' }));
  expect(asked.queryByRole('button', { name: 'Remove link' })).toBeNull();
  await user.type(asked.getByRole('textbox', { name: 'Link address' }), 'javascript:x');
  expect(asked.getByRole('button', { name: 'Apply' }).hasAttribute('disabled')).toBe(true);
  await user.clear(asked.getByRole('textbox', { name: 'Link address' }));
  await user.type(asked.getByRole('textbox', { name: 'Link address' }), '/contact/');
  await user.click(asked.getByRole('button', { name: 'Apply' }));
  expect(answers()).toEqual([{ source: 'velocity-cms', type: 'linkAnswer', href: '/contact/' }]);
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Link' })).toBeNull());

  // A link that is there can be taken away, and closing the window leaves it.
  await say({ source: 'velocity-cms', type: 'linkAsk', id: 's1', field: 'story', href: '/contact/' });
  await user.click(within(await screen.findByRole('dialog', { name: 'Link' })).getByRole('button', { name: 'Remove link' }));
  expect(answers().at(-1)?.href).toBe('');
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Link' })).toBeNull());
  await say({ source: 'velocity-cms', type: 'linkAsk', id: 's1', field: 'story', href: '/contact/' });
  await user.click(within(await screen.findByRole('dialog', { name: 'Link' })).getByRole('button', { name: 'Close' }));
  expect(answers().at(-1)?.href).toBeNull();
});

it('shows a section\'s background as swatches, in the form and on its bar on the page', async () => {
  const user = userEvent.setup();
  const tone: FieldDef = {
    id: 'bf-hero-tone',
    key: 'tone',
    type: 'select',
    label: { en: 'Background' },
    required: false,
    translated: false,
    options: { choices: ['default', 'secondary'], labels: { default: { en: 'White' }, secondary: { en: 'Warm stone' } }, swatches: { default: '#ffffff', secondary: '#f4f1ec' } },
  };
  const fields = samplePagesType.fields.map((field) =>
    field.id === 'f-body'
      ? { ...field, options: { ...field.options, blocks: (field.options['blocks'] as BlockDef[]).map((block) => (block.id === 'b-hero' ? { ...block, fields: [...block.fields, tone] } : block)) } }
      : field,
  );
  renderApp('/content/pages/p1', { user: sampleUser, contentTypes: [...sampleContentTypes, { ...samplePagesType, fields }], entries: [...sampleEntries(), samplePage()] });
  const shown = await frame();
  const post = vi.spyOn(shown.contentWindow as Window, 'postMessage').mockImplementation(() => undefined);
  await say({ source: 'velocity-cms', type: 'ready' });
  type Told = { type: string; sections?: Record<string, { swatches?: unknown }> };
  const told = () => post.mock.calls.map(([message]) => message as Told).filter((message) => message.type === 'tools').at(-1);
  expect(told()?.sections?.['s1']?.swatches).toEqual([
    { field: 'tone', name: 'Background', choices: [{ value: 'default', name: 'White', colour: '#ffffff' }, { value: 'secondary', name: 'Warm stone', colour: '#f4f1ec' }] },
  ]);
  expect(told()?.sections?.['s2']?.swatches).toEqual([]);
  const held = () => (draft().data['f-body'] as BlockValue[])[0]?.data['bf-hero-tone'];

  // A dot pressed on the page chooses it, and only a choice the field has.
  await say({ source: 'velocity-cms', type: 'swatch', id: 's1', field: 'tone', value: 'secondary' });
  expect(held()).toBe('secondary');
  await say({ source: 'velocity-cms', type: 'swatch', id: 's1', field: 'tone', value: 'purple' });
  await say({ source: 'velocity-cms', type: 'swatch', id: 's1', field: 'gone', value: 'default' });
  expect(held()).toBe('secondary');
  await waitFor(() => expect((told()?.sections?.['s1']?.swatches as { chosen?: string }[])[0]?.chosen).toBe('secondary'));

  // The same choice in the form is a row of swatches, each by its name.
  await user.click(await screen.findByRole('button', { name: /^Page opening/ }));
  const background = within(screen.getByRole('radiogroup', { name: 'Background' }));
  expect(background.getByRole('radio', { name: 'Warm stone' }).getAttribute('aria-checked')).toBe('true');
  await user.click(background.getByRole('radio', { name: 'White' }));
  expect(held()).toBe('default');
});

it('tries the site\'s theme on the page from the visual editor, and publishes it to the settings', async () => {
  const user = userEvent.setup();
  const brand: FieldDef = {
    id: 'f-set-brand',
    key: 'brand',
    type: 'select',
    label: { en: 'Brand color' },
    required: false,
    translated: false,
    options: { choices: ['harbor', 'clay'], labels: { harbor: { en: 'Harbor' }, clay: { en: 'Clay' } }, swatches: { harbor: '#1f3a5f', clay: '#8a5a3c' } },
  };
  const name: FieldDef = { ...brand, id: 'f-set-name', key: 'name', type: 'text', label: { en: 'Name' }, options: {} };
  const settings = { id: 'type-settings', key: 'settings', kind: 'single' as const, label: { en: 'Business details' }, inSettings: true as const, fields: [name, brand] };
  const kept = { ...samplePage(), id: 'set1', typeId: 'type-settings', translationGroup: 'set1', slug: 'settings', data: { 'f-set-name': 'Oakhaven', 'f-set-brand': 'harbor' } };
  const { client } = renderApp('/content/pages/p1', { user: sampleUser, contentTypes: [...sampleContentTypes, samplePagesType, settings], entries: [...sampleEntries(), samplePage(), kept] });
  await frame();
  await user.click(await screen.findByRole('button', { name: 'Visual editor' }));
  await user.click(await screen.findByRole('button', { name: 'Theme' }));

  const card = within(await screen.findByRole('region', { name: 'Site theme' }));
  const colours = within(card.getByRole('radiogroup', { name: 'Brand color' }));
  expect(colours.getByRole('radio', { name: 'Harbor' }).getAttribute('aria-checked')).toBe('true');
  // Only the looks are here: the rest of the settings stays in Settings.
  expect(card.queryByRole('textbox', { name: 'Name' })).toBeNull();
  expect(card.getByRole('button', { name: 'Publish theme' })).toHaveProperty('disabled', true);
  expect((draft() as { with?: unknown }).with).toBeUndefined();

  // Chosen, it goes to the page with the page's own draft, and nothing is saved.
  await user.click(colours.getByRole('radio', { name: 'Clay' }));
  expect((draft() as { with?: unknown }).with).toEqual([{ id: 'set1', data: { 'f-set-name': 'Oakhaven', 'f-set-brand': 'clay' } }]);
  expect((await client.getEntry('set1')).data['f-set-brand']).toBe('harbor');
  await user.click(card.getByRole('button', { name: 'Discard' }));
  expect((draft() as { with?: unknown }).with).toBeUndefined();

  await user.click(colours.getByRole('radio', { name: 'Clay' }));
  await user.click(card.getByRole('button', { name: 'Publish theme' }));
  expect(await screen.findByText('Theme published')).toBeTruthy();
  const stored = await client.getEntry('set1');
  expect(stored.data).toEqual({ 'f-set-name': 'Oakhaven', 'f-set-brand': 'clay' });
  expect(stored.published?.data['f-set-brand']).toBe('clay');
  await waitFor(() => expect((draft() as { with?: unknown }).with).toBeUndefined());
  expect(within(screen.getByRole('radiogroup', { name: 'Brand color' })).getByRole('radio', { name: 'Clay' }).getAttribute('aria-checked')).toBe('true');
});

it('offers no theme where the settings have no looks to choose', async () => {
  const user = userEvent.setup();
  renderApp('/content/pages/p1', site());
  await frame();
  await user.click(await screen.findByRole('button', { name: 'Visual editor' }));
  expect(screen.queryByRole('button', { name: 'Theme' })).toBeNull();
});
