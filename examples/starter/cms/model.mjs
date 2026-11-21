/**
 * This site's content, as the CMS is told about it: the kinds of content, their fields, and the
 * sections a page can be built from. `seed.mjs` applies it with `schema.define`, which is safe to
 * run again: a field keeps its id by key, so content stays.
 *
 * Each block here has a component of the same key in src/components/blocks.ts.
 */
const en = (text) => ({ en: text });
const field = (type) => (key, label, { help, ...extra } = {}) => ({ key, type, label: en(label), ...(help && { help: en(help) }), ...extra });
const text = field('text');
const long = (key, label, extra = {}) => text(key, label, { ...extra, options: { multiline: true } });
const rich = field('richtext');
const link = field('link');
const group = (key, label, fields) => field('group')(key, label, { options: { fields } });
// How many items a list takes (`min`, `max`) belongs with what it holds, in its options.
const list = (key, label, of, { min, max, ...extra } = {}) =>
  field('list')(key, label, { ...extra, options: { of: { type: of.type, options: of.options ?? {} }, ...(min !== undefined && { min }), ...(max !== undefined && { max }) } });
const block = (key, label, description, icon, fields) => ({ key, label: en(label), description: en(description), icon, group: 'Sections', fields });
const section = (key, label, fields, aside = false) => ({ key, label: en(label), fields, ...(aside && { aside }) });

const blocks = [
  block('hero', 'Hero', 'A large heading with a line under it and a button. Usually first.', 'layout-template', [
    text('eyebrow', 'Small heading'),
    text('title', 'Title', { required: true }),
    long('lead', 'Lead'),
    text('buttonLabel', 'Button words'),
    link('buttonTo', 'Button goes to'),
  ]),
  block('text', 'Text', 'A heading and text you shape: paragraphs, lists, bold and links.', 'align-left', [text('title', 'Title'), rich('body', 'Text', { required: true })]),
  block('features', 'Features', 'Up to six short points in a grid.', 'layout-grid', [
    text('title', 'Title'),
    list('items', 'Points', group('item', 'Point', [text('title', 'Name', { required: true }), long('text', 'A sentence or two')]), { required: true, max: 6 }),
  ]),
  block('call-to-action', 'Call to action', 'One line and one button, on a band of colour.', 'panel-top', [
    text('title', 'Title', { required: true }),
    text('buttonLabel', 'Button words', { required: true }),
    link('buttonTo', 'Button goes to', { required: true }),
  ]),
  block('form', 'Form', 'One of the site\'s forms. What people send arrives under Forms.', 'message-circle', [
    text('title', 'Title'),
    long('lead', 'Lead'),
    field('form')('form', 'Form', { required: true, help: 'Forms are made and changed under Forms.' }),
  ]),
];

const pages = {
  key: 'pages',
  // A page may sit under another: its slug can be services/roofing. The page called index is the home page.
  urlPattern: '/[...slug]',
  kind: 'collection',
  label: en('Pages'),
  titleField: 'title',
  fields: [
    text('title', 'Title', { required: true, help: 'The page\'s name in the browser tab and in search results.' }),
    long('description', 'Description', { help: 'One or two sentences for search results and shared links.' }),
    field('blocks')('body', 'Sections', { options: { blocks } }),
  ],
  sections: [section('sections', 'Sections', ['body']), section('page', 'About this page', ['title', 'description'], true)],
};

const posts = {
  key: 'posts',
  urlPattern: '/blog/[slug]',
  kind: 'collection',
  label: en('Posts'),
  titleField: 'title',
  fields: [
    text('title', 'Title', { required: true }),
    field('date')('date', 'Date', { required: true }),
    long('excerpt', 'Summary', { help: 'Shown in the list of posts and in search results.' }),
    rich('body', 'Text', { required: true }),
  ],
  sections: [section('post', 'Post', ['title', 'body']), section('about', 'About this post', ['date', 'excerpt'], true)],
};

const menuLink = group('item', 'Link', [text('label', 'Label', { required: true }), link('link', 'Goes to', { required: true })]);
const navigation = {
  key: 'navigation',
  kind: 'single',
  label: en('Navigation'),
  fields: [list('header', 'Header links', menuLink, { help: 'The links across the top of every page, in order.' })],
};

// The site's look, set in the editor (Settings, and Theme in the visual editor, where a change shows on the
// page at once). The layout turns these into CSS variables; what is left empty keeps the stylesheet's own.
const fonts = { system: en('System'), serif: en('Serif'), rounded: en('Rounded') };
const theme = {
  key: 'theme',
  kind: 'single',
  inSettings: true,
  label: en('Theme'),
  fields: [
    field('color')('brand', 'Brand colour', { help: 'Buttons, links and the band of colour.', translated: false, options: { presets: ['#2f4bd8', '#0f766e', '#c2410c', '#7c3aed', '#be123c', '#16181d'] } }),
    field('font')('headings', 'Headings font', { translated: false, options: { choices: Object.keys(fonts), labels: fonts } }),
  ],
};

export const model = [pages, posts, navigation, theme];

export const forms = [
  {
    key: 'contact',
    label: en('Contact'),
    fields: [
      text('name', 'Your name', { required: true, options: { maxLength: 80 } }),
      field('email')('email', 'Email', { required: true }),
      text('message', 'Message', { required: true, options: { multiline: true, maxLength: 3000 } }),
    ],
    submitLabel: en('Send message'),
    success: en('Thanks. We will get back to you soon.'),
    contact: { name: 'name', email: 'email' },
    retentionDays: 365,
  },
];

/** The pages a new site starts with, written by field key. A section names its form by key. */
export const samplePages = [
  {
    slug: 'index',
    title: 'Starter',
    description: 'A small site on Velocity CMS.',
    body: [
      { block: 'hero', data: { eyebrow: 'Velocity CMS', title: 'This page is yours to edit.', lead: 'Sign in at /admin, open Pages, and change anything you see here. It is on the site about a second after you publish.', buttonLabel: 'Read the blog', buttonTo: { kind: 'address', href: '/blog/' } } },
      { block: 'features', data: { title: 'What is here', items: [
        { title: 'Pages from sections', text: 'Add, move and remove sections, with the page beside the form as you type.' },
        { title: 'A blog', text: 'Posts with drafts, history, scheduled publishing and preview links.' },
        { title: 'A form and a CRM', text: 'The contact form is built in the editor. Whoever writes becomes a contact.' },
      ] } },
      { block: 'call-to-action', data: { title: 'Say hello', buttonLabel: 'Contact', buttonTo: { kind: 'address', href: '/contact/' } } },
    ],
  },
  {
    slug: 'contact',
    title: 'Contact',
    description: 'Write to us.',
    body: [{ block: 'form', data: { title: 'Contact', lead: 'What you send arrives under Forms in the editor.', form: 'contact' } }],
  },
];

export const samplePosts = [
  {
    slug: 'hello',
    title: 'Hello',
    date: '2026-01-01',
    excerpt: 'The first post of a new site.',
    body: ['This post lives in the CMS. Open Posts in the editor to change it, or write the next one.', 'A post can be saved as a draft, shared with a preview link, and set to go out at a time.'],
  },
];

export const sampleMenu = [
  { label: 'Home', page: 'index' },
  { label: 'Blog', href: '/blog/' },
  { label: 'Contact', page: 'contact' },
];
