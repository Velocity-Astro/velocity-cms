import { act, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { BlockValue } from '@velocity-astro/cms-core';
import { dismissToasts } from '@velocity-astro/cms-ui';
import { afterEach, expect, it } from 'vitest';
import type { MemoryAdminClient } from '../testing/memory-client.js';
import { renderApp } from '../testing/render-app.js';
import { samplePage, samplePagesType, sampleUser } from '../testing/sample-content.js';

const page = () => renderApp('/content/pages/p1', { user: sampleUser, contentTypes: [samplePagesType], entries: [samplePage()] });
const sections = async () => within(await screen.findByRole('group', { name: 'Sections' }));
const stored = async (client: MemoryAdminClient) => (await client.getEntry('p1')).data['f-body'] as BlockValue[];
const save = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Save draft' }));
  expect(await screen.findByText('Draft saved')).toBeTruthy();
  await act(() => dismissToasts());
};
const choose = async (user: ReturnType<typeof userEvent.setup>, more: RegExp, action: string) => {
  await user.click(screen.getByRole('button', { name: more }));
  await user.click(await screen.findByRole('menuitem', { name: action }));
};

afterEach(() => act(() => dismissToasts()));

it('lists a page\'s sections closed, each by its kind and a few of its words', async () => {
  page();
  const list = await sections();
  const headings = list.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
  expect(headings).toEqual(['Page openingSell for more, with less to do', 'TextHow we work', 'MapAustinNo longer used']);
  expect(list.queryByRole('textbox')).toBeNull();
});

it('opens a section to its block\'s own fields, and saves what is typed by field id', async () => {
  const user = userEvent.setup();
  const { client } = page();
  const list = await sections();
  await user.click(list.getByRole('button', { name: /^Text/ }));
  expect(list.getByRole<HTMLInputElement>('textbox', { name: 'Heading' }).value).toBe('How we work');
  await user.type(list.getByRole('textbox', { name: 'Words' }), 'We start with a walk through the house.');
  await save(user);
  expect((await stored(client))[1]).toEqual({ id: 's2', block: 'b-text', data: { 'bf-text-title': 'How we work', 'bf-text-body': 'We start with a walk through the house.' } });
});

it('adds a section from the kinds the template has today, grouped, and opens it', async () => {
  const user = userEvent.setup();
  const { client } = page();
  const list = await sections();
  await user.click(list.getByRole('button', { name: 'Add section' }));
  const picker = within(await screen.findByRole('dialog', { name: 'Add a section' }));
  expect(picker.getAllByRole('group')).toHaveLength(3);
  expect(picker.getAllByRole('option').map((option) => option.textContent)).toEqual([
    "Page openingThe page's heading and a line under it.",
    'TextA heading with paragraphs under it.',
    'Call to actionA closing line with a button.',
  ]);
  // A kind the template has dropped cannot be added.
  expect(picker.queryByRole('option', { name: /^Map/ })).toBeNull();

  await user.click(picker.getByRole('option', { name: /^Call to action/ }));
  await user.type(await screen.findByRole('textbox', { name: 'Line' }), 'Ready when you are');
  await save(user);
  const body = await stored(client);
  expect(body).toHaveLength(4);
  expect(body[3]).toMatchObject({ block: 'b-cta', data: { 'bf-cta-title': 'Ready when you are' } });
  expect(body[3]?.id).not.toBe('');
});

it('moves, duplicates and hides a section', async () => {
  const user = userEvent.setup();
  const { client } = page();
  const list = await sections();
  await user.click(list.getByRole('button', { name: 'Move section 2, Text, up' }));
  await choose(user, /^More for section 1, Text/, 'Duplicate');
  await choose(user, /^More for section 3, Page opening/, 'Hide from the site');
  expect(list.getByRole('button', { name: /^Page opening.*Hidden$/ })).toBeTruthy();
  await save(user);

  const body = await stored(client);
  expect(body.map((section) => section.block)).toEqual(['b-text', 'b-text', 'b-hero', 'b-map']);
  expect(body[1]?.id).not.toBe('s2');
  expect(body[1]?.data).toEqual({ 'bf-text-title': 'How we work' });
  expect(body[2]?.hidden).toBe(true);

  await choose(user, /^More for section 3, Page opening/, 'Show on the site');
  await save(user);
  expect((await stored(client))[2]).not.toHaveProperty('hidden');
});

it('asks before removing a section that has something in it', async () => {
  const user = userEvent.setup();
  const { client } = page();
  await sections();
  await choose(user, /^More for section 2, Text/, 'Remove');
  const question = within(await screen.findByRole('alertdialog', { name: 'Remove this text section?' }));
  await user.click(question.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(screen.getByRole('button', { name: /^Text/ })).toBeTruthy();

  await choose(user, /^More for section 2, Text/, 'Remove');
  await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remove section' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: /^Text/ })).toBeNull());
  await save(user);
  expect((await stored(client)).map((section) => section.id)).toEqual(['s1', 's3']);
});

it('keeps a section whose kind the template dropped, says why it is off the site, and lets it go', async () => {
  const user = userEvent.setup();
  const { client } = page();
  const list = await sections();
  await user.click(list.getByRole('button', { name: /^Map/ }));
  expect(list.getByText(/no longer has this kind of section/)).toBeTruthy();
  expect(list.queryByRole('textbox')).toBeNull();
  await user.click(list.getByRole('button', { name: /^More for section 3, Map/ }));
  expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual(['Remove']);
  await user.keyboard('{Escape}');

  // Saving something else leaves it as it was.
  await user.type(screen.getByRole('textbox', { name: 'Title' }), '!');
  await save(user);
  expect((await stored(client))[2]).toEqual({ id: 's3', block: 'b-map', data: { 'bf-map-place': 'Austin' } });
});

it('shows why a page could not be published on the section and on the field inside it', async () => {
  const user = userEvent.setup();
  page();
  const list = await sections();
  await user.click(list.getByRole('button', { name: 'Add section' }));
  await user.click(await screen.findByRole('option', { name: /^Call to action/ }));
  await user.click(await screen.findByRole('button', { name: /^Call to action/ }));
  await user.click(screen.getByRole('button', { name: 'Publish' }));

  expect(await screen.findByText('Not published')).toBeTruthy();
  // Closed, the section says something inside needs fixing.
  expect(await list.findByText('1 thing to fix in this section.')).toBeTruthy();
  await user.click(list.getByRole('button', { name: /^Call to action/ }));
  const line = list.getByRole('textbox', { name: 'Line' });
  expect(line.getAttribute('aria-invalid')).toBe('true');
  expect(list.getByText('Fill this in before publishing.')).toBeTruthy();

  await user.type(line, 'Ready when you are');
  await waitFor(() => expect(line.getAttribute('aria-invalid')).toBeNull());
});

it('starts a new page with no sections and says how to begin', async () => {
  renderApp('/content/pages/new', { user: sampleUser, contentTypes: [samplePagesType], entries: [] });
  expect(await (await sections()).findByText('No sections yet. Add the first one to start the page.')).toBeTruthy();
});
