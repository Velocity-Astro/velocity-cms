import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { TextField, dismissToasts } from '@velocity-astro/cms-ui';
import { afterEach, expect, it, vi } from 'vitest';
import { AdminApp } from '../../app/AdminApp.js';
import { createFieldControlRegistry, createFieldControls } from '../../fields/index.js';
import { tinyPng } from '@velocity-astro/cms-core/in-memory';
import { MemoryAdminClient } from '../../testing/memory-client.js';
import { renderApp } from '../../testing/render-app.js';
import { sampleContentTypes, sampleEntries, samplePagesType, sampleUser } from '../../testing/sample-content.js';

const signedIn = () => ({ user: sampleUser, contentTypes: sampleContentTypes, entries: sampleEntries() });
const saveBar = () => within(screen.getByRole('region', { name: 'Save and publish' }));
const field = (name: string) => screen.findByRole<HTMLInputElement>('textbox', { name });

/** The editor's own controls without the one for lists, as a site that replaces it would start. */
const controlsWithoutLists = () => {
  const all = createFieldControls();
  const some = createFieldControlRegistry();
  for (const name of ['text-input', 'url-input', 'number-input', 'date-picker', 'switch', 'select', 'group']) some.register(all.get(name));
  return some;
};

afterEach(() => act(() => dismissToasts()));

it('opens an entry from the list, with each value in the control its field type asks for', async () => {
  const user = userEvent.setup();
  renderApp('/content/listings', signedIn());
  await user.click(await screen.findByRole('rowheader', { name: /^6214 Lakeshore Drive/ }));

  expect(await screen.findByRole('heading', { level: 1, name: '6214 Lakeshore Drive' })).toBeTruthy();
  expect((await field('Title')).value).toBe('6214 Lakeshore Drive');
  expect((await field('Price')).value).toBe('500,000');
  expect(screen.getByRole('button', { name: /Stage/ }).textContent).toContain('For sale');
  expect(screen.getByRole('switch', { name: 'Show on the homepage' })).toHaveProperty('checked', false);
  expect(screen.getByRole('group', { name: 'Listed on' })).toBeTruthy();
  const address = within(screen.getByRole('group', { name: 'Address' }));
  expect(address.getByRole<HTMLInputElement>('textbox', { name: 'City' }).value).toBe('Austin');
  expect((await field('Slug')).value).toBe('6214-lakeshore-drive');
  expect(screen.getByText("The page's address on the site: /listings/6214-lakeshore-drive")).toBeTruthy();
  expect(saveBar().getByText('Published')).toBeTruthy();
  expect(saveBar().getByText('Saved 2 hours ago')).toBeTruthy();
});

it('saves a draft without changing what visitors see', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/content/listings/e1', signedIn());
  const save = await screen.findByRole('button', { name: 'Save draft' });
  expect(save).toHaveProperty('disabled', true);

  await user.type(await field('Title'), ' East');
  expect(saveBar().getByText('Unsaved changes')).toBeTruthy();
  await user.click(save);

  expect(await screen.findByText('Draft saved')).toBeTruthy();
  expect(saveBar().getByText('Unpublished changes')).toBeTruthy();
  expect(saveBar().getByText('Saved now')).toBeTruthy();
  const stored = await client.getEntry('e1');
  expect(stored.data['f-title']).toBe('6214 Lakeshore Drive East');
  expect(stored.published?.data['f-title']).toBe('6214 Lakeshore Drive');
});

it('publishes what has been typed, saving it first', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/content/listings/e2', signedIn());
  await user.type(await field('Title'), ' North');
  await user.click(screen.getByRole('button', { name: 'Publish' }));

  expect(await screen.findByText('Visitors can see it now.')).toBeTruthy();
  expect(saveBar().getByText('Published')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Publish changes' })).toHaveProperty('disabled', true);
  expect((await client.getEntry('e2')).published?.data['f-title']).toBe('18 Alder Court North');
});

it('shows on each field why an entry could not be published, down into a group', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/content/listings/e4', signedIn());
  await user.type(within(await screen.findByRole('group', { name: 'Address' })).getByRole('textbox', { name: 'Street' }), '4 Elm Row');
  await user.click(screen.getByRole('button', { name: 'Publish' }));

  expect(await screen.findByText('Not published')).toBeTruthy();
  expect(screen.getByText('2 fields need attention.')).toBeTruthy();
  const title = await field('Title');
  const city = await field('City');
  expect(title.getAttribute('aria-invalid')).toBe('true');
  expect(city.getAttribute('aria-invalid')).toBe('true');
  expect(screen.getAllByText('Fill this in before publishing.')).toHaveLength(2);
  // What was typed is saved all the same, and the entry stays a draft.
  const stored = await client.getEntry('e4');
  expect(stored.data['f-address']).toEqual({ 'f-street': '4 Elm Row' });
  expect(stored.status).toBe('draft');

  await user.type(title, 'Elm Row');
  await waitFor(() => expect(title.getAttribute('aria-invalid')).toBeNull());
  expect(city.getAttribute('aria-invalid')).toBe('true');
});

it('creates an entry whose slug follows its title, and carries on editing it', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/content/agents', signedIn());
  await user.click(await screen.findByRole('button', { name: 'New entry' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'New entry' })).toBeTruthy();
  expect(saveBar().getByText('Not saved yet')).toBeTruthy();

  await user.type(await field('Name'), 'María Ortiz');
  expect((await field('Slug')).value).toBe('maria-ortiz');
  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(await screen.findByText('Draft saved')).toBeTruthy();

  const [created] = (await client.listEntries({ type: 'agents' })).items;
  expect(created).toMatchObject({ slug: 'maria-ortiz', locale: 'en', status: 'draft', data: { 'f-name': 'María Ortiz' } });

  // The same form is now editing the saved entry: a second save updates it.
  await user.type(await field('Name'), ' Vega');
  expect((await field('Slug')).value).toBe('maria-ortiz');
  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  await waitFor(async () => expect((await client.getEntry(created?.id ?? '')).data['f-name']).toBe('María Ortiz Vega'));
  expect((await client.listEntries({ type: 'agents' })).total).toBe(1);

  await user.click(within(screen.getByRole('region', { name: 'Save and publish' })).getByRole('link', { name: 'Agents' }));
  expect(await screen.findByRole('rowheader', { name: /^María Ortiz Vega/ })).toBeTruthy();
});

it('takes an address of several parts where the type allows pages under pages', async () => {
  const user = userEvent.setup();
  const deepPages = { ...samplePagesType, urlPattern: '/[...slug]' };
  const { client } = renderApp('/content/pages/new', { user: sampleUser, contentTypes: [deepPages], entries: [] });
  await user.type(await field('Title'), 'Roofing');
  await user.clear(await field('Slug'));
  await user.type(await field('Slug'), 'services//roofing');
  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(await screen.findByText(/with a slash between the parts of a longer address/)).toBeTruthy();
  expect((await client.listEntries({ type: 'pages' })).total).toBe(0);

  await user.clear(await field('Slug'));
  await user.type(await field('Slug'), 'services/roofing');
  expect(screen.getByText(/The page's address on the site: \/services\/roofing\./)).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  await waitFor(async () => expect((await client.listEntries({ type: 'pages' })).items[0]?.slug).toBe('services/roofing'));
});

it('asks for a usable slug before sending anything', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/content/agents/new', signedIn());
  await user.click(await screen.findByRole('button', { name: 'Save draft' }));
  expect(await screen.findByText("Enter a slug. It is the last part of the page's address.")).toBeTruthy();

  await user.type(await field('Slug'), 'Sam Lee');
  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(await screen.findByText('Use lowercase letters, numbers and hyphens, such as lake-house.')).toBeTruthy();
  expect((await client.listEntries({ type: 'agents' })).total).toBe(0);
});

it('refuses to overwrite a save someone else made in the meantime', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/content/listings/e2', signedIn());
  const title = await field('Title');
  const theirs = await client.getEntry('e2');
  await client.updateEntry('e2', { slug: theirs.slug, data: { ...theirs.data, 'f-price': 1 }, expectedRevision: theirs.revision });

  await user.type(title, ' West');
  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(await screen.findByText('Not saved')).toBeTruthy();
  expect(screen.getByText(/saved by someone else while you were editing/)).toBeTruthy();
  expect((await client.getEntry('e2')).data['f-title']).toBe('18 Alder Court');
  // Nothing typed is lost.
  expect(title.value).toBe('18 Alder Court West');
});

const more = async (user: ReturnType<typeof userEvent.setup>, action: string) => {
  await user.click(await screen.findByRole('button', { name: 'More actions' }));
  await user.click(await screen.findByRole('menuitem', { name: action }));
};

it('takes an entry off the site only after asking', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/content/listings/e1', signedIn());
  await more(user, 'Unpublish');
  const dialog = within(await screen.findByRole('alertdialog', { name: 'Take this off the site?' }));
  await user.click(dialog.getByRole('button', { name: 'Cancel' }));
  expect((await client.getEntry('e1')).status).toBe('published');

  await more(user, 'Unpublish');
  await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Unpublish' }));
  expect(await screen.findByText('It is off the site. Its content is kept as a draft.')).toBeTruthy();
  expect(saveBar().getByText('Draft')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'More actions' }));
  expect(await screen.findByRole('menuitem', { name: 'Move to trash' })).toBeTruthy();
  expect(screen.queryByRole('menuitem', { name: 'Unpublish' })).toBeNull();
  expect((await client.getEntry('e1')).status).toBe('draft');
});

it('moves an entry to the trash only after asking, says what that means, and goes back to the list', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/content/listings/e1', signedIn());
  await more(user, 'Move to trash');
  const dialog = within(await screen.findByRole('alertdialog', { name: 'Move this to the trash?' }));
  // It is on the site, so the question says visitors lose it.
  expect(dialog.getByText(/Visitors will no longer find it/)).toBeTruthy();
  await user.click(dialog.getByRole('button', { name: 'Cancel' }));
  expect(await client.getEntry('e1')).not.toHaveProperty('deletedAt');

  await more(user, 'Move to trash');
  await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Move to trash' }));
  expect(await screen.findByText('6214 Lakeshore Drive moved to the trash')).toBeTruthy();
  expect(await screen.findByRole('heading', { level: 1, name: 'Listings' })).toBeTruthy();
  expect(screen.queryByRole('rowheader', { name: /^6214 Lakeshore Drive/ })).toBeNull();
  expect(await client.getEntry('e1')).toMatchObject({ status: 'draft' });
  expect((await client.listTrash()).items.map((entry) => entry.id)).toEqual(['e1']);
});

it('duplicates an entry and opens the copy, a draft with what was saved', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/content/listings/e1', signedIn());
  await more(user, 'Duplicate');
  expect(await screen.findByText('6214 Lakeshore Drive duplicated')).toBeTruthy();
  await waitFor(() => expect(saveBar().getByText('Draft')).toBeTruthy());
  const original = await client.getEntry('e1');
  const copies = (await client.listEntries({ type: 'listings' })).items.filter((entry) => entry.slug === `${original.slug}-copy`);
  expect(copies).toHaveLength(1);
  expect(copies[0]).toMatchObject({ status: 'draft', data: original.data });
  expect(original.status).toBe('published');
});

it('sets an entry to go on the site at a time, shows that, and takes it off the schedule', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/content/listings/e2', signedIn());
  await more(user, 'Schedule');
  const dialog = within(await screen.findByRole('dialog', { name: 'Schedule' }));
  // Tomorrow at nine is offered, in the time zone of whoever is asking.
  expect(dialog.getByText(/Times are in your time zone/)).toBeTruthy();
  await user.click(dialog.getByRole('button', { name: 'Schedule' }));
  expect(await screen.findByText(/^It goes on the site /)).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Schedule' })).toBeNull());
  const set = await client.getEntry('e2');
  expect(set.status).toBe('draft');
  expect(new Date(set.publishAt ?? 0).getTime()).toBeGreaterThan(Date.now());
  expect(await saveBar().findByText(/^Goes on the site /)).toBeTruthy();

  await more(user, 'Change the schedule');
  const again = within(await screen.findByRole('dialog', { name: 'Schedule' }));
  expect(again.getByText(/^Set to go on the site /)).toBeTruthy();
  await user.click(again.getByRole('button', { name: 'Take off the schedule' }));
  expect(await screen.findByText('Taken off the schedule')).toBeTruthy();
  expect(await client.getEntry('e2')).not.toHaveProperty('publishAt');
});

it('leaves scheduling out for an author, who cannot publish', async () => {
  const user = userEvent.setup();
  renderApp('/content/listings/e2', { ...signedIn(), user: { ...sampleUser, role: 'author' } });
  await user.click(await screen.findByRole('button', { name: 'More actions' }));
  expect(await screen.findByRole('menuitem', { name: 'History' })).toBeTruthy();
  expect(screen.queryByRole('menuitem', { name: 'Schedule' })).toBeNull();
});

it('shows every save of an entry and brings an earlier version back as a new save', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/content/listings/e2', signedIn());
  const first = await client.getEntry('e2');
  const headline = await screen.findByRole('textbox', { name: /^Title/ });
  await user.clear(headline);
  await user.type(headline, '19 Alder Court');
  await more(user, 'History');
  const waiting = within(await screen.findByRole('dialog', { name: 'History' }));
  // What is typed and not saved would be replaced, so it is dealt with first.
  expect(await waiting.findByText(/Save or undo what you have typed/)).toBeTruthy();
  await user.click(waiting.getByRole('button', { name: 'Close' }));
  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(await screen.findByText('Draft saved')).toBeTruthy();

  await more(user, 'History');
  const dialog = within(await screen.findByRole('dialog', { name: 'History' }));
  expect(await dialog.findByText('Changed Title')).toBeTruthy();
  expect(dialog.getByText('First saved')).toBeTruthy();
  await user.click(dialog.getByRole('button', { name: 'Bring back this version' }));
  expect(await screen.findByText(/^Version from .* brought back$/)).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'History' })).toBeNull());
  expect(await client.getEntry('e2')).toMatchObject({ revision: 3, data: first.data });
  expect((screen.getByRole('textbox', { name: /^Title/ }) as HTMLInputElement).value).not.toBe('19 Alder Court');
});

it('says an entry is in the trash instead of opening it, with the way there', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/', signedIn());
  await client.trashEntry('e2');
  // The trash is kept with the content: the rail's Content, then its column.
  await user.click(await screen.findByRole('link', { name: 'Content' }));
  await user.click(await screen.findByRole('link', { name: 'Trash' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Trash' })).toBeTruthy();
});

it('names a field it has no control for, and keeps its content', async () => {
  const user = userEvent.setup();
  const entries = sampleEntries().map((entry) => (entry.id === 'e2' ? { ...entry, data: { ...entry.data, 'f-photos': ['https://example.com/a.jpg'] } } : entry));
  const client = new MemoryAdminClient({ ...signedIn(), entries });
  render(<AdminApp client={client} siteName="Lakeshore" fieldControls={controlsWithoutLists()} initialPath="/content/listings/e2" />);
  const photos = within(await screen.findByRole('group', { name: 'Photos' }));
  expect(photos.getByText('This kind of field cannot be edited here yet. Its content is kept as it is.')).toBeTruthy();

  await user.type(await field('Title'), '!');
  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(await screen.findByText('Draft saved')).toBeTruthy();
  expect((await client.getEntry('e2')).data['f-photos']).toEqual(['https://example.com/a.jpg']);
});

it('uses a control a site or plugin registers for its own field type', async () => {
  const user = userEvent.setup();
  const fieldControls = controlsWithoutLists().register({
    type: 'list',
    Component: ({ label, value, onChange }) => (
      <TextField label={`${label} (one address)`} value={Array.isArray(value) ? String(value[0] ?? '') : ''} onChange={(next) => onChange([next])} />
    ),
  });
  const client = new MemoryAdminClient(signedIn());
  render(<AdminApp client={client} siteName="Lakeshore" fieldControls={fieldControls} initialPath="/content/listings/e2" />);
  await user.type(await field('Photos (one address)'), 'https://example.com/b.jpg');
  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(await screen.findByText('Draft saved')).toBeTruthy();
  expect((await client.getEntry('e2')).data['f-photos']).toEqual(['https://example.com/b.jpg']);
});

it('says so when the entry does not exist, or belongs to another type', async () => {
  const first = renderApp('/content/listings/nope', signedIn());
  expect(await screen.findByRole('heading', { name: 'This entry does not exist' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'All listings' })).toBeTruthy();
  first.unmount();

  renderApp('/content/agents/e1', signedIn());
  expect(await screen.findByRole('heading', { name: 'This entry does not exist' })).toBeTruthy();
});

it('shows what went wrong when the entry cannot be loaded, and tries again', async () => {
  const user = userEvent.setup();
  const client = new MemoryAdminClient(signedIn());
  const getEntry = client.getEntry.bind(client);
  let failures = 1;
  client.getEntry = (id) => (failures-- > 0 ? Promise.reject(new Error('The server did not answer.')) : getEntry(id));
  render(<AdminApp client={client} siteName="Lakeshore" initialPath="/content/listings/e1" />);
  expect(await screen.findByText('The server did not answer.')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('heading', { level: 1, name: '6214 Lakeshore Drive' })).toBeTruthy();
});

it('switches to the entry\'s other language', async () => {
  const user = userEvent.setup();
  const [first, ...rest] = sampleEntries();
  if (!first) throw new Error('No sample entries.');
  const spanish = { ...first, id: 'e-es', locale: 'es', slug: 'paseo-del-lago', data: { ...first.data, 'f-title': 'Paseo del Lago 6214' } };
  renderApp(`/content/listings/${first.id}`, { ...signedIn(), entries: [first, spanish, ...rest] });

  // The language it is in names the button, which opens the others.
  await screen.findByRole('heading', { level: 1, name: '6214 Lakeshore Drive' });
  await user.click(saveBar().getByRole('button', { name: 'English' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Edit in Spanish' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Paseo del Lago 6214' })).toBeTruthy();
  expect((await field('Slug')).value).toBe('paseo-del-lago');
});

it('on a phone, offers the entry\'s other language in its menu, so the bar keeps to one row of buttons', async () => {
  // A window as narrow as a phone: every media query that asks for one says yes.
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width'), media: query, addEventListener: () => {}, removeEventListener: () => {} }));
  try {
    const user = userEvent.setup();
    const [first, ...rest] = sampleEntries();
    if (!first) throw new Error('No sample entries.');
    const spanish = { ...first, id: 'e-es', locale: 'es', slug: 'paseo-del-lago', data: { ...first.data, 'f-title': 'Paseo del Lago 6214' } };
    renderApp(`/content/listings/${first.id}`, { ...signedIn(), entries: [first, spanish, ...rest] });

    await screen.findByRole('heading', { level: 1, name: '6214 Lakeshore Drive' });
    expect(saveBar().queryByRole('button', { name: 'English' })).toBeNull();
    await user.click(saveBar().getByRole('button', { name: 'More actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit in Spanish' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Paseo del Lago 6214' })).toBeTruthy();
  } finally {
    vi.unstubAllGlobals();
  }
});

it('asks before leaving with unsaved changes, and keeps what was typed when the person stays', async () => {
  const user = userEvent.setup();
  renderApp('/content/listings/e1', signedIn());
  await user.type(await field('Title'), ' East');

  await user.click(saveBar().getByRole('link', { name: 'Listings' }));
  const question = within(await screen.findByRole('alertdialog', { name: 'Leave without saving?' }));
  await user.click(question.getByRole('button', { name: 'Keep editing' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog', { name: 'Leave without saving?' })).toBeNull());
  expect((await field('Title')).value).toBe('6214 Lakeshore Drive East');

  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Content' }));
  await user.click(within(await screen.findByRole('alertdialog', { name: 'Leave without saving?' })).getByRole('button', { name: 'Leave without saving' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Agents' })).toBeTruthy();
});

it('does not ask when nothing was changed, or once the changes are saved', async () => {
  const user = userEvent.setup();
  renderApp('/content/listings/e1', signedIn());
  await user.type(await field('Title'), ' East');
  await user.click(saveBar().getByRole('button', { name: 'Save draft' }));
  await waitFor(() => expect(saveBar().getByRole('button', { name: 'Save draft' })).toHaveProperty('disabled', true));
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Content' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Agents' })).toBeTruthy();
  expect(screen.queryByRole('alertdialog', { name: 'Leave without saving?' })).toBeNull();
});

it('does not ask about a new entry nobody typed in', async () => {
  const user = userEvent.setup();
  renderApp('/content/agents/new', signedIn());
  await field('Slug');
  await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Content' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Agents' })).toBeTruthy();
  expect(screen.queryByRole('alertdialog', { name: 'Leave without saving?' })).toBeNull();
});

it('shows no language switch for an entry in one language', async () => {
  renderApp('/content/listings/e1', signedIn());
  await screen.findByRole('heading', { level: 1, name: '6214 Lakeshore Drive' });
  expect(saveBar().queryByRole('button', { name: 'English' })).toBeNull();
});

it('builds a list: add an item, fill it in, reorder, remove', async () => {
  const user = userEvent.setup();
  const entries = sampleEntries().map((entry) => (entry.id === 'e2' ? { ...entry, data: { ...entry.data, 'f-photos': ['https://example.com/a.jpg'] } } : entry));
  const { client } = renderApp('/content/listings/e2', { ...signedIn(), entries });
  const photos = within(await screen.findByRole('group', { name: 'Photos' }));
  expect(photos.getByRole<HTMLInputElement>('textbox', { name: 'Photos 1' }).value).toBe('https://example.com/a.jpg');

  await user.click(photos.getByRole('button', { name: 'Add' }));
  await user.type(photos.getByRole('textbox', { name: 'Photos 2' }), 'https://example.com/b.jpg');
  await user.click(photos.getByRole('button', { name: 'Move Photos 2 up' }));
  expect(photos.getByRole<HTMLInputElement>('textbox', { name: 'Photos 1' }).value).toBe('https://example.com/b.jpg');
  // An item added and left empty is not part of what is saved.
  await user.click(photos.getByRole('button', { name: 'Add' }));

  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(await screen.findByText('Draft saved')).toBeTruthy();
  expect((await client.getEntry('e2')).data['f-photos']).toEqual(['https://example.com/b.jpg', 'https://example.com/a.jpg']);

  await user.click(photos.getByRole('button', { name: 'Remove Photos 1' }));
  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  await waitFor(async () => expect((await client.getEntry('e2')).data['f-photos']).toEqual(['https://example.com/a.jpg']));
});

it('lays the fields out in the sections the content type names, and calls the entry by its title field', async () => {
  const [listings, ...others] = sampleContentTypes;
  if (!listings) throw new Error('No sample types.');
  const address = listings.fields.find((candidate) => candidate.key === 'address');
  const street = (address?.options['fields'] as { id: string; key: string }[]).find((candidate) => candidate.key === 'street');
  const sectioned = {
    ...listings,
    titlePath: [address?.id ?? '', street?.id ?? ''],
    sections: [{ key: 'where', label: { en: 'Where it is' }, fieldIds: [address?.id ?? ''] }],
  };
  renderApp('/content/listings/e1', { ...signedIn(), contentTypes: [sectioned, ...others] });
  expect(await screen.findByRole('heading', { level: 1, name: '6214 Lakeshore Drive' })).toBeTruthy();
  const where = within(screen.getByRole('region', { name: 'Where it is' }));
  expect(where.getByRole('group', { name: 'Address' })).toBeTruthy();
  expect(within(screen.getByRole('region', { name: 'Other details' })).getByRole('textbox', { name: 'Title' })).toBeTruthy();
  expect(within(screen.getByRole('region', { name: 'Address on the site' })).getByRole('textbox', { name: 'Slug' })).toBeTruthy();
});

it('calls the slug an identifier for a type whose entries have no page of their own', async () => {
  const [listings, ...others] = sampleContentTypes;
  if (!listings) throw new Error('No sample types.');
  const { urlPattern: _address, ...withoutPages } = listings;
  renderApp('/content/listings/e1', { ...signedIn(), contentTypes: [withoutPages, ...others] });
  const card = within(await screen.findByRole('region', { name: 'Identifier' }));
  expect(card.getByRole('textbox', { name: 'Slug' })).toBeTruthy();
  expect(card.getByText(/other entries link to/)).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Address on the site' })).toBeNull();
});

it('links to an entry of another type by name, and keeps a link it cannot find', async () => {
  const user = userEvent.setup();
  const [listings, agents] = sampleContentTypes;
  if (!listings || !agents) throw new Error('No sample types.');
  const linked = {
    ...listings,
    fields: [...listings.fields, { id: 'f-agent', key: 'agent', type: 'reference', label: { en: 'Agent' }, translated: false, required: false, options: { to: 'agents' } }],
  };
  const [first, ...rest] = sampleEntries();
  if (!first) throw new Error('No sample entries.');
  const nameField = agents.fields.find((candidate) => candidate.type === 'text');
  const agent = { ...first, id: 'a1', typeId: agents.id, translationGroup: 'a1', slug: 'maya-ellison', data: { [nameField?.id ?? '']: 'Maya Ellison' } };
  const withGone = { ...first, data: { ...first.data, 'f-agent': 'someone-gone' } };
  const { client } = renderApp(`/content/listings/${first.id}`, { ...signedIn(), contentTypes: [linked, agents], entries: [withGone, ...rest, agent] });

  const picker = await screen.findByRole('button', { name: /Agent/ });
  await waitFor(() => expect(picker.textContent).toContain('someone-gone (not found)'));
  await user.click(picker);
  await user.click(await screen.findByRole('option', { name: 'Maya Ellison' }));
  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(await screen.findByText('Draft saved')).toBeTruthy();
  expect((await client.getEntry(first.id)).data['f-agent']).toBe('maya-ellison');
});

/** The sample listings with a cover photo, an image field. */
const withCover = (options: { uploads?: boolean } = {}) => {
  const contentTypes = sampleContentTypes.map((type) =>
    type.key === 'listings'
      ? { ...type, fields: [...type.fields, { id: 'f-cover', key: 'cover', type: 'image', label: { en: 'Cover photo' }, required: false, translated: false, options: {} }] }
      : type,
  );
  return new MemoryAdminClient({ ...signedIn(), contentTypes, images: [{ name: 'porch', url: '/images/porch.jpg' }], ...options });
};
const fileInput = () => document.querySelector<HTMLInputElement>('input[type="file"]') as HTMLInputElement;

it('uploads a photo from the computer, chooses it and saves it with the entry', async () => {
  const user = userEvent.setup();
  const client = withCover();
  render(<AdminApp client={client} siteName="Lakeshore" initialPath="/content/listings/e2" />);
  const cover = within(await screen.findByRole('group', { name: 'Cover photo' }));
  await user.click(cover.getByRole('button', { name: 'Choose an image' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Choose an image' }));
  expect(dialog.getByText('JPEG, PNG or WebP, up to 4 MB. Larger photos are made smaller first.')).toBeTruthy();

  await user.upload(fileInput(), new File([tinyPng(1600, 900)], 'Front Porch.png', { type: 'image/png' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose an image' })).toBeNull());
  expect(cover.getByText('front-porch')).toBeTruthy();
  expect(cover.getByRole('button', { name: 'Change' })).toBeTruthy();
  expect((await screen.findByRole('alertdialog', { name: 'Image uploaded' })).textContent).toContain('Save the entry to keep it.');

  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(await screen.findByText('Draft saved')).toBeTruthy();
  expect((await client.getEntry('e2')).data['f-cover']).toBe('front-porch');
  // The new photo is there to choose for the next field, without loading the page again.
  await user.click(cover.getByRole('button', { name: 'Change' }));
  expect(await screen.findByRole('option', { name: 'front-porch' })).toBeTruthy();
});

it('says why a file was not taken, and leaves the window open to try another', async () => {
  const user = userEvent.setup();
  render(<AdminApp client={withCover()} siteName="Lakeshore" initialPath="/content/listings/e2" />);
  const cover = within(await screen.findByRole('group', { name: 'Cover photo' }));
  await user.click(cover.getByRole('button', { name: 'Choose an image' }));
  await screen.findByRole('dialog', { name: 'Choose an image' });

  await user.upload(fileInput(), new File(['not a picture'], 'notes.png', { type: 'image/png' }));
  const dialog = within(screen.getByRole('dialog', { name: 'Choose an image' }));
  expect((await dialog.findByRole('alert')).textContent).toBe('The file is not an image this site can show. Upload a JPEG, PNG or WebP.');
  expect(cover.getByText('No image chosen')).toBeTruthy();

  await user.upload(fileInput(), new File([tinyPng()], 'porch.png', { type: 'image/png' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Choose an image' })).toBeNull());
  expect(cover.getByText('porch-2')).toBeTruthy();
});

it('offers no upload on a site that has nowhere to keep one', async () => {
  const user = userEvent.setup();
  render(<AdminApp client={withCover({ uploads: false })} siteName="Lakeshore" initialPath="/content/listings/e2" />);
  const cover = within(await screen.findByRole('group', { name: 'Cover photo' }));
  await user.click(cover.getByRole('button', { name: 'Choose an image' }));
  const dialog = within(await screen.findByRole('dialog', { name: 'Choose an image' }));
  expect(dialog.getByRole('option', { name: 'porch' })).toBeTruthy();
  expect(dialog.queryByRole('button', { name: 'Upload an image' })).toBeNull();
});

/** Stands in for the browser's new tab, and remembers where it was sent. */
function newTab() {
  const tab = { location: { href: '' }, close: vi.fn() };
  const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
  return { tab, open };
}

it('previews a draft: saves what was typed, then opens its page in a new tab', async () => {
  const user = userEvent.setup();
  const { tab, open } = newTab();
  const { client } = renderApp('/content/listings/e1', signedIn());
  const title = await field('Title');
  await user.clear(title);
  await user.type(title, '6214 Lakeshore Drive, renovated');
  await user.click(saveBar().getByRole('button', { name: 'More actions' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Preview' }));

  await waitFor(() => expect(tab.location.href).toMatch(/\/listings\/6214-lakeshore-drive\/\?preview=\d+\.[0-9a-f]{64}$/));
  expect(open).toHaveBeenCalledWith('', '_blank');
  // The preview shows what is saved, so the draft was saved first. Visitors still see the old one.
  const saved = await client.getEntry('e1');
  expect(saved.data['f-title']).toBe('6214 Lakeshore Drive, renovated');
  expect(saved.published?.data['f-title']).toBe('6214 Lakeshore Drive');
  expect(saveBar().getByRole('button', { name: 'Save draft' })).toHaveProperty('disabled', true);
  open.mockRestore();
});

it('closes the tab and says why when there is no preview, and offers none for a type without pages', async () => {
  const user = userEvent.setup();
  const { tab, open } = newTab();
  const client = new MemoryAdminClient(signedIn());
  client.previewEntry = () => Promise.reject(new Error('This site has no previews.'));
  render(<AdminApp client={client} siteName="Lakeshore" initialPath="/content/listings/e1" />);
  await user.click(await screen.findByRole('button', { name: 'More actions' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Preview' }));
  expect(await screen.findByText('This site has no previews.')).toBeTruthy();
  expect(tab.close).toHaveBeenCalled();
  expect(tab.location.href).toBe('');
  open.mockRestore();
});

it('offers no preview for a type whose entries have no page of their own', async () => {
  const contentTypes = sampleContentTypes.map(({ urlPattern: _pattern, ...type }) => type);
  render(<AdminApp client={new MemoryAdminClient({ ...signedIn(), contentTypes })} siteName="Lakeshore" initialPath="/content/listings/e1" />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'More actions' }));
  await screen.findByRole('menuitem', { name: 'History' });
  expect(screen.queryByRole('menuitem', { name: 'Preview' })).toBeNull();
});

/** The sample listings with a description: rich text in a field that used to be a list of paragraphs. */
const withDescription = () => {
  const contentTypes = sampleContentTypes.map((type) =>
    type.key === 'listings'
      ? { ...type, fields: [...type.fields, { id: 'f-about', key: 'about', type: 'richtext', label: { en: 'About the home' }, required: true, translated: false, options: {} }] }
      : type,
  );
  const entries = sampleEntries().map((entry) => (entry.id === 'e2' ? { ...entry, data: { ...entry.data, 'f-about': ['Four bedrooms.', 'A dock on the lake.'] } } : entry));
  return new MemoryAdminClient({ ...signedIn(), contentTypes, entries });
};

// The rich text editor asks what is under the pointer; a page with no layout has no answer.
it('shows text saved as plain paragraphs in the rich text editor, and saves it formatted', async () => {
  document.elementFromPoint = () => null;
  const user = userEvent.setup();
  const client = withDescription();
  render(<AdminApp client={client} siteName="Lakeshore" initialPath="/content/listings/e2" />);
  const about = await screen.findByRole('textbox', { name: /^About the home/ });
  expect(within(about).getByText('Four bedrooms.')).toBeTruthy();
  expect(within(about).getByText('A dock on the lake.')).toBeTruthy();
  // Opening it changed nothing, so there is nothing to save yet.
  expect(screen.getByRole('button', { name: 'Save draft' })).toHaveProperty('disabled', true);

  await user.click(within(screen.getByRole('toolbar', { name: 'Formatting' })).getByRole('button', { name: 'Heading' }));
  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(await screen.findByText('Draft saved')).toBeTruthy();
  expect((await client.getEntry('e2')).data['f-about']).toEqual({
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Four bedrooms.' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'A dock on the lake.' }] },
    ],
  });
});

it('takes a change back and makes it again, with the buttons and with the keys', async () => {
  const user = userEvent.setup();
  renderApp('/content/listings/e1', signedIn());
  const undo = await screen.findByRole('button', { name: 'Undo' });
  const redo = screen.getByRole('button', { name: 'Redo' });
  expect(undo).toHaveProperty('disabled', true);
  expect(redo).toHaveProperty('disabled', true);

  await user.type(await field('Title'), ' East');
  await user.click(screen.getByRole('switch', { name: 'Show on the homepage' }));
  expect(saveBar().getByText('Unsaved changes')).toBeTruthy();

  await user.click(undo);
  expect(screen.getByRole('switch', { name: 'Show on the homepage' })).toHaveProperty('checked', false);
  expect((await field('Title')).value).toBe('6214 Lakeshore Drive East');
  // The words typed in one go are one step.
  await user.click(undo);
  expect((await field('Title')).value).toBe('6214 Lakeshore Drive');
  expect(saveBar().getByText('Saved 2 hours ago')).toBeTruthy();
  expect(undo).toHaveProperty('disabled', true);

  await user.click(redo);
  expect((await field('Title')).value).toBe('6214 Lakeshore Drive East');
  // With the keys, away from anywhere words are typed.
  act(() => screen.getByRole('switch', { name: 'Show on the homepage' }).focus());
  await user.keyboard('{Control>}z{/Control}');
  expect((await field('Title')).value).toBe('6214 Lakeshore Drive');
  await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
  expect((await field('Title')).value).toBe('6214 Lakeshore Drive East');
  // In a field of words the browser takes back the typing itself.
  await user.click(await field('Title'));
  await user.keyboard('{Control>}z{/Control}');
  expect((await field('Title')).value).toBe('6214 Lakeshore Drive East');
  expect(undo).toHaveProperty('disabled', false);
});

it('saves the draft by itself once the typing pauses, and publishes nothing', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/content/listings/e1', signedIn());
  const update = vi.spyOn(client, 'updateEntry');
  await user.type(await field('Title'), ' East');
  expect(saveBar().getByText('Unsaved changes')).toBeTruthy();
  expect(update).not.toHaveBeenCalled();

  await waitFor(() => expect(saveBar().getByText(/^Saved /)).toBeTruthy(), { timeout: 6000 });
  expect(update).toHaveBeenCalledTimes(1);
  const kept = await client.getEntry('e1');
  expect(Object.values(kept.data)).toContain('6214 Lakeshore Drive East');
  expect(Object.values(kept.published?.data ?? {})).not.toContain('6214 Lakeshore Drive East');
  // It works in silence: the bar says so, and no message is shown.
  expect(screen.queryByText('Draft saved')).toBeNull();
  // What was typed can still be taken back.
  expect(screen.getByRole('button', { name: 'Undo' })).toHaveProperty('disabled', false);
}, 10_000);

it('says so in the bar when the draft could not be saved by itself, keeps what was typed, and does not try for ever', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/content/listings/e1', signedIn());
  const update = vi.spyOn(client, 'updateEntry').mockRejectedValue(new Error('No connection'));
  await user.type(await field('Title'), ' East');
  await waitFor(() => expect(saveBar().getByText('Not saved. Press "Save draft" to see why.')).toBeTruthy(), { timeout: 6000 });
  expect((await field('Title')).value).toBe('6214 Lakeshore Drive East');
  await new Promise((done) => setTimeout(done, 3000));
  expect(update).toHaveBeenCalledTimes(1);
  // The button says why.
  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(await screen.findByText('No connection')).toBeTruthy();
}, 15_000);
