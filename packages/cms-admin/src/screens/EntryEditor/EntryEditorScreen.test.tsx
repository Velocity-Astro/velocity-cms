import { act, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { TextField, dismissToasts } from '@velocity/cms-ui';
import { afterEach, expect, it } from 'vitest';
import { AdminApp } from '../../app/AdminApp.js';
import { createFieldControlRegistry, createFieldControls } from '../../fields/index.js';
import { MemoryAdminClient } from '../../testing/memory-client.js';
import { renderApp } from '../../testing/render-app.js';
import { sampleContentTypes, sampleEntries, sampleUser } from '../../testing/sample-content.js';

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

it('takes an entry off the site only after asking', async () => {
  const user = userEvent.setup();
  const { client } = renderApp('/content/listings/e1', signedIn());
  await user.click(await screen.findByRole('button', { name: 'Unpublish' }));
  const dialog = within(await screen.findByRole('alertdialog', { name: 'Take this off the site?' }));
  await user.click(dialog.getByRole('button', { name: 'Cancel' }));
  expect((await client.getEntry('e1')).status).toBe('published');

  await user.click(screen.getByRole('button', { name: 'Unpublish' }));
  await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Unpublish' }));
  expect(await screen.findByText('It is off the site. Its content is kept as a draft.')).toBeTruthy();
  expect(saveBar().getByText('Draft')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Unpublish' })).toBeNull();
  expect((await client.getEntry('e1')).status).toBe('draft');
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

it('switches to the entry\'s other language, once there is nothing unsaved to lose', async () => {
  const user = userEvent.setup();
  const [first, ...rest] = sampleEntries();
  if (!first) throw new Error('No sample entries.');
  const spanish = { ...first, id: 'e-es', locale: 'es', slug: 'paseo-del-lago', data: { ...first.data, 'f-title': 'Paseo del Lago 6214' } };
  renderApp(`/content/listings/${first.id}`, { ...signedIn(), entries: [first, spanish, ...rest] });

  const languages = within(await screen.findByRole('radiogroup', { name: 'Language' }));
  expect(languages.getByRole('radio', { name: 'English' }).getAttribute('aria-checked')).toBe('true');

  // While something is typed and not saved, the other language waits.
  await user.type(await field('Title'), '!');
  expect(languages.getByRole('radio', { name: 'Spanish' })).toHaveProperty('disabled', true);
  await user.click(saveBar().getByRole('button', { name: 'Save draft' }));
  await waitFor(() => expect(languages.getByRole('radio', { name: 'Spanish' })).toHaveProperty('disabled', false));

  await user.click(languages.getByRole('radio', { name: 'Spanish' }));
  expect(await screen.findByRole('heading', { level: 1, name: 'Paseo del Lago 6214' })).toBeTruthy();
  expect((await field('Slug')).value).toBe('paseo-del-lago');
});

it('shows no language switch for an entry in one language', async () => {
  renderApp('/content/listings/e1', signedIn());
  await screen.findByRole('heading', { level: 1, name: '6214 Lakeshore Drive' });
  expect(screen.queryByRole('radiogroup', { name: 'Language' })).toBeNull();
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
