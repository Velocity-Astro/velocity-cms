/**
 * The real estate template's content types, as the CMS is told about them: what each field is
 * called, what kind it is, the help under it, and how the editor groups them.
 *
 * Applied with `cms.schema.define`, which is safe to run on every deploy: a field keeps its
 * id, so content stays. This belongs with the template and will move there.
 */
const en = (text) => ({ en: text });
const field = (type) => (key, label, { help, ...extra } = {}) => ({ key, type, label: en(label), ...(help && { help: en(help) }), ...extra });
const text = field('text');
const number = field('number');
const date = field('date');
const toggle = field('boolean');
const url = field('url');
const image = field('image');
/** Text a person shapes: headings, lists, bold and links. */
const rich = field('richtext');
const link = (key, label, to, extra = {}) => field('reference')(key, label, { ...extra, options: { to } });
const long = (key, label, extra = {}) => text(key, label, { ...extra, options: { multiline: true } });
const choice = (key, label, choices, extra = {}) =>
  field('select')(key, label, {
    ...extra,
    options: { choices: Object.keys(choices), labels: Object.fromEntries(Object.entries(choices).map(([value, name]) => [value, en(name)])) },
  });
const group = (key, label, fields, extra = {}) => field('group')(key, label, { ...extra, options: { fields } });
/** A list of one kind of thing. `of` is a field described as above; only its type and settings are used. */
const list = (key, label, of, extra = {}) => field('list')(key, label, { ...extra, options: { of: { type: of.type, options: of.options ?? {} } } });
const section = (key, label, fields) => ({ key, label: en(label), fields });

const onTheSite = (fields) => ({ ...section('site', 'On the site', fields), aside: true });
const order = number('order', 'Order', { required: true, help: 'Lower numbers come first in lists.' });

const listings = {
  key: 'listings',
  urlPattern: '/listings/[path]',
  localizedUrlPatterns: { es: '/es/propiedades/[path]' },
  kind: 'collection',
  label: { en: 'Listings', es: 'Propiedades' },
  titleField: 'address.street',
  listImage: 'photos',
  listFields: ['price', 'status'],
  fields: [
    text('headline', 'Headline', { required: true, help: 'One line under the address, such as "Restored 1928 farmhouse on a corner lot".' }),
    choice('offer', 'Offer', { sale: 'For sale', rent: 'For rent' }, { required: true }),
    choice('status', 'Sale status', { active: 'Active', 'coming-soon': 'Coming soon', pending: 'Pending', sold: 'Sold', leased: 'Leased' }, { required: true }),
    choice('type', 'Property type', { house: 'House', townhome: 'Townhome', condo: 'Condo', multifamily: 'Multifamily' }, { required: true }),
    date('listedAt', 'Listed on', { required: true }),
    text('mlsId', 'MLS number'),
    toggle('isNew', 'Show a "New" badge'),

    number('price', 'Price', { required: true, help: 'Sale price, or rent per month.' }),
    number('previousPrice', 'Price before reduction', { help: 'Set it above the price to show "Price reduced".' }),
    number('hoa', 'HOA dues per month'),
    number('tax', 'Property tax per year', { help: 'Leave empty to estimate it.' }),
    number('soldPrice', 'Sold for'),
    date('soldAt', 'Sold on'),

    number('beds', 'Bedrooms', { required: true }),
    number('baths', 'Bathrooms', { required: true, help: 'Half baths count as 0.5.' }),
    number('area', 'Living area', { required: true }),
    number('lotArea', 'Lot size'),
    number('yearBuilt', 'Year built'),
    number('parking', 'Parking spaces'),

    group('address', 'Address', [
      text('street', 'Street', { required: true }),
      text('unit', 'Unit'),
      text('city', 'City', { required: true }),
      text('region', 'State', { required: true }),
      text('postcode', 'ZIP code', { required: true }),
    ], { required: true }),
    link('neighborhood', 'Neighborhood', 'neighborhoods', { required: true }),
    number('lat', 'Latitude', { required: true }),
    number('lng', 'Longitude', { required: true, help: 'Latitude and longitude place the pin on the map.' }),

    list('photos', 'Photos', image('photo', 'Photo'), { required: true, help: 'The first is the cover. The second shows on hover.' }),
    text('floorPlan', 'Floor plan'),
    url('tourUrl', 'Virtual tour link'),

    rich('description', 'Description', { required: true }),
    list('highlights', 'Highlights', text('highlight', 'Highlight'), { help: 'Short chips such as "Pool" or "Home office".' }),
    list('features', 'Features', group('feature', 'Feature', [text('title', 'Heading', { required: true }), list('items', 'Items', text('item', 'Item'))]), {
      help: 'Grouped under headings such as Interior, Exterior and Systems.',
    }),

    list('openHouses', 'Open houses', group('openHouse', 'Open house', [
      choice('day', 'Day', { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' }, { required: true }),
      text('start', 'From', { required: true, help: 'As 13:00.' }),
      text('end', 'Until', { required: true, help: 'As 16:00.' }),
    ]), { help: 'Repeats every week.' }),

    group('rental', 'Lease terms', [
      date('availableFrom', 'Available from', { help: 'Leave empty for "Available now".' }),
      number('deposit', 'Deposit', { required: true }),
      choice('pets', 'Pets', { allowed: 'Allowed', cats: 'Cats only', none: 'No pets' }, { required: true }),
      toggle('furnished', 'Furnished'),
      list('leaseMonths', 'Lease lengths in months', number('months', 'Months'), { required: true }),
    ], { help: 'For rentals only.' }),

    link('agent', 'Listing agent', 'agents', { required: true }),
    text('path', 'Web address', { required: true, help: 'The last part of the listing\'s address in this language.' }),
    order,
  ],
  sections: [
    section('overview', 'Overview', ['headline', 'offer', 'status', 'type', 'listedAt', 'mlsId', 'isNew']),
    section('price', 'Price', ['price', 'previousPrice', 'hoa', 'tax', 'soldPrice', 'soldAt']),
    section('facts', 'Facts', ['beds', 'baths', 'area', 'lotArea', 'yearBuilt', 'parking']),
    section('location', 'Location', ['address', 'neighborhood', 'lat', 'lng']),
    section('photos', 'Photos and tour', ['photos', 'floorPlan', 'tourUrl']),
    section('description', 'Description', ['description', 'highlights', 'features']),
    section('visits', 'Open houses', ['openHouses']),
    section('rental', 'Rental', ['rental']),
    { ...section('agent', 'Agent', ['agent']), aside: true },
    onTheSite(['path', 'order']),
  ],
};

const agents = {
  key: 'agents',
  urlPattern: '/agents/[slug]',
  localizedUrlPatterns: { es: '/es/agentes/[slug]' },
  kind: 'collection',
  label: { en: 'Agents', es: 'Agentes' },
  titleField: 'name',
  listImage: 'photo',
  listFields: ['role'],
  fields: [
    text('name', 'Name', { required: true }),
    text('role', 'Role', { required: true }),
    text('summary', 'Summary', { required: true, help: 'One sentence, shown on cards.' }),
    rich('bio', 'Biography', { required: true }),
    image('photo', 'Photo', { help: 'Without one, the card shows initials.' }),
    group('phone', 'Phone', [text('display', 'As shown', { required: true }), text('href', 'Link', { required: true, help: 'As tel:+12145550143.' })], { required: true }),
    text('email', 'Email', { required: true }),
    text('licence', 'Licence', { required: true }),
    list('specialties', 'Specialties', choice('specialty', 'Specialty', {
      buying: 'Buying', selling: 'Selling', leasing: 'Leasing', management: 'Management', relocation: 'Relocation', luxury: 'Luxury',
    }), { required: true, help: 'Used by the filter on the agents page.' }),
    list('languages', 'Languages', text('language', 'Language'), { required: true }),
    list('areas', 'Neighborhoods', link('area', 'Neighborhood', 'neighborhoods'), { help: 'The neighborhoods they know best.' }),
    order,
  ],
  sections: [
    section('about', 'About', ['name', 'role', 'summary', 'bio', 'photo']),
    section('contact', 'Contact', ['phone', 'email', 'licence']),
    section('work', 'Work', ['specialties', 'languages', 'areas']),
    onTheSite(['order']),
  ],
};

const neighborhoods = {
  key: 'neighborhoods',
  urlPattern: '/neighborhoods/[path]',
  localizedUrlPatterns: { es: '/es/vecindarios/[path]' },
  kind: 'collection',
  label: { en: 'Neighborhoods', es: 'Barrios' },
  titleField: 'name',
  listImage: 'photo',
  listFields: ['city'],
  fields: [
    text('name', 'Name', { required: true }),
    text('city', 'City', { required: true }),
    text('summary', 'Summary', { required: true, help: 'One sentence, shown on cards.' }),
    list('intro', 'Introduction', long('paragraph', 'Paragraph'), { required: true, help: 'One item per paragraph.' }),
    image('photo', 'Photo', { required: true }),
    list('tags', 'Tags', text('tag', 'Tag'), { help: 'Short tags such as "Walkable" or "Lake access".' }),
    list('highlights', 'Highlights', group('highlight', 'Highlight', [text('title', 'Heading', { required: true }), long('body', 'Text', { required: true })])),
    list('facts', 'Quick facts', group('fact', 'Fact', [text('label', 'Label', { required: true }), text('value', 'Value', { required: true })]), {
      help: 'Only publish facts you can stand behind.',
    }),
    list('schools', 'Schools', group('school', 'School', [text('name', 'Name', { required: true }), text('grades', 'Grades', { required: true })])),
    text('path', 'Web address', { required: true, help: 'The last part of the guide\'s address in this language.' }),
    order,
  ],
  sections: [
    section('about', 'About', ['name', 'city', 'summary', 'intro', 'photo', 'tags']),
    section('guide', 'Guide', ['highlights', 'facts', 'schools']),
    onTheSite(['path', 'order']),
  ],
};

const reviews = {
  key: 'reviews',
  kind: 'collection',
  label: { en: 'Reviews', es: 'Opiniones' },
  titleField: 'author',
  listImage: 'photo',
  fields: [
    long('quote', 'Quote', { required: true }),
    text('author', 'Author', { required: true, help: 'First name and initial is enough.' }),
    text('context', 'What they did', { required: true, help: 'Such as "Bought in Lakewood".' }),
    number('rating', 'Rating', { required: true, options: { min: 1, max: 5, integer: true }, help: 'From 1 to 5.' }),
    choice('kind', 'Kind', { buying: 'Buying', selling: 'Selling', renting: 'Renting', management: 'Management' }, { required: true }),
    link('agent', 'Agent', 'agents', { help: 'Shows the review on their page.' }),
    image('photo', 'Photo', { help: 'A photo of the home it was about.' }),
    text('reviewId', 'Reference', { required: true, help: 'Shared by every language of this review.' }),
    order,
  ],
  sections: [
    section('review', 'Review', ['quote', 'author', 'context', 'rating', 'kind']),
    { ...section('with', 'Shown with', ['agent', 'photo']), aside: true },
    onTheSite(['reviewId', 'order']),
  ],
};

/**
 * The blocks a page can be built from. Each has a component under the same key in the template
 * (src/cms/blocks.ts), which draws it with the template's own parts. What a block looks like is
 * a choice among a few named looks, never a free size or colour.
 */
const block = (key, label, { description, icon, group: under }, fields) => ({ key, label: en(label), description: en(description), icon, group: under, fields });
const tone = (choices = { default: 'White', secondary: 'Warm stone' }) => choice('tone', 'Background', choices);
const heading = [text('eyebrow', 'Small heading', { help: 'A word or two above the title.' }), text('title', 'Title')];
const ICONS = {
  check: 'Check', handshake: 'Handshake', map: 'Map', 'map-pin': 'Map pin', 'message-circle': 'Speech bubble', 'shield-check': 'Shield', home: 'Home', key: 'Key',
  signpost: 'Signpost', 'building-2': 'Building', 'calendar-check': 'Calendar', 'badge-dollar-sign': 'Price', 'trending-up': 'Rising line', users: 'People', star: 'Star', clock: 'Clock', phone: 'Phone', 'file-text': 'Document',
};
const button = (prefix, label) => [
  text(`${prefix}Label`, `${label} words`),
  field('link')(`${prefix}To`, `${label} goes to`, { help: 'A page of this site, chosen by name, or an address typed by hand.' }),
];

const pageBlocks = [
  block('page-hero', 'Page opening', { description: 'The page\'s heading, a line under it and a photo beside it.', icon: 'layout-template', group: 'Opening' }, [
    text('eyebrow', 'Small heading', { help: 'A word or two above the title.' }),
    text('title', 'Title', { required: true }),
    long('lead', 'Lead', { help: 'One or two sentences under the title.' }),
    choice('size', 'Size', { md: 'Standard', lg: 'Large' }),
    choice('background', 'Background', { glow: 'Soft glow', grain: 'Paper grain', gradient: 'Gradient', plain: 'Plain' }),
    image('photo', 'Photo', { help: 'Shown beside the title on wide screens.' }),
    text('photoAlt', 'What the photo shows', { help: 'Read aloud to people who cannot see it.' }),
  ]),
  block('text', 'Text', { description: 'A heading with paragraphs, lists and links.', icon: 'text', group: 'Content' }, [
    text('title', 'Title'),
    rich('body', 'Text', { required: true }),
    choice('layout', 'Layout', { beside: 'Title beside the text', stacked: 'Title above the text' }),
    tone(),
  ]),
  block('image', 'Photo', { description: 'One photo across the page, with a line under it.', icon: 'image', group: 'Content' }, [
    image('photo', 'Photo', { required: true }),
    text('alt', 'What the photo shows', { help: 'Read aloud to people who cannot see it.' }),
    text('caption', 'Caption'),
    choice('shape', 'Shape', { wide: 'Wide', standard: 'Standard' }),
  ]),
  block('feature-grid', 'Points', { description: 'A few points side by side, each with an icon.', icon: 'layout-grid', group: 'Content' }, [
    ...heading,
    choice('columns', 'Across', { 2: 'Two', 3: 'Three', 4: 'Four' }),
    tone(),
    list('items', 'Points', group('item', 'Point', [choice('icon', 'Icon', ICONS), text('title', 'Name', { required: true }), long('text', 'A line about it')]), { required: true }),
  ]),
  block('feature-split', 'Photo and text', { description: 'A photo on one side and words with a button on the other.', icon: 'columns-2', group: 'Content' }, [
    ...heading,
    rich('body', 'Text'),
    image('photo', 'Photo'),
    text('photoAlt', 'What the photo shows', { help: 'Read aloud to people who cannot see it.' }),
    choice('photoSide', 'Photo on the', { right: 'Right', left: 'Left' }),
    tone(),
    ...button('button', 'Button'),
  ]),
  block('stats', 'Figures', { description: 'A row of numbers, each with what it counts.', icon: 'hash', group: 'Proof' }, [
    ...heading,
    tone({ invert: 'Slate', secondary: 'Warm stone', default: 'White' }),
    list('items', 'Figures', group('item', 'Figure', [text('value', 'Figure', { required: true, help: 'As it should read: 1,200 or 98%.' }), text('label', 'What it counts', { required: true })]), { required: true }),
  ]),
  block('questions', 'Questions', { description: 'Questions people ask, one answer open at a time.', icon: 'circle-help', group: 'Proof' }, [
    ...heading,
    tone(),
    list('items', 'Questions', group('item', 'Question', [text('question', 'Question', { required: true }), long('answer', 'Answer', { required: true })]), { required: true }),
  ]),
  block('call-to-action', 'Call to action', { description: 'A closing line with one or two buttons over a photo.', icon: 'megaphone', group: 'Action' }, [
    text('title', 'Title', { required: true }),
    long('lead', 'Lead'),
    image('photo', 'Photo'),
    ...button('button', 'First button'),
    ...button('second', 'Second button'),
  ]),
  block('home-hero', 'Home page opening', { description: 'A headline and the home search over a photo, with one listing beside it.', icon: 'house', group: 'Opening' }, [
    text('eyebrow', 'Small heading', { help: 'A word or two above the title.' }),
    text('title', 'Title', { required: true }),
    text('titleAccent', 'Title, second line', { help: 'Shown in the brand colour after the title.' }),
    long('lead', 'Lead', { help: 'One or two sentences under the title.' }),
    image('photo', 'Photo', { help: 'Shown beside the title, and blurred behind it.' }),
    text('photoAlt', 'What the photo shows', { help: 'Read aloud to people who cannot see it.' }),
    list('points', 'Short points', text('point', 'Point'), { help: 'A few words each, shown with a tick under the search.' }),
    link('listing', 'Listing on the photo', 'listings', { help: 'Left empty, the newest home for sale is shown.' }),
  ]),
  block('services', 'Services', { description: 'Photo cards that turn over, one for each thing you do.', icon: 'gallery-horizontal', group: 'Content' }, [
    ...heading,
    long('lead', 'Lead'),
    list('items', 'Services', group('item', 'Service', [
      text('title', 'Name', { required: true }),
      long('text', 'A line about it'),
      choice('icon', 'Icon', ICONS),
      image('photo', 'Photo'),
      ...button('link', 'Link'),
    ]), { required: true }),
  ]),
  block('listings', 'Listings', { description: 'Homes on the market now, always the newest. For sale, for rent or both.', icon: 'house', group: 'From the CMS' }, [
    ...heading,
    choice('show', 'Show', { both: 'For sale and for rent, with a switch', sale: 'For sale', rent: 'For rent' }),
    choice('count', 'How many', { 3: 'Three', 6: 'Six', 9: 'Nine' }),
  ]),
  block('listing-spotlight', 'One listing', { description: 'One home in full: its photos, price, facts and two buttons.', icon: 'star', group: 'From the CMS' }, [
    text('eyebrow', 'Small heading'),
    link('listing', 'Listing', 'listings', { help: 'Left empty, the newest home for sale is shown.' }),
    text('buttonLabel', 'Button words'),
    text('tourLabel', 'Tour button words'),
  ]),
  block('neighborhoods', 'Neighborhoods', { description: 'The neighborhood guides, the first one large.', icon: 'map', group: 'From the CMS' }, [
    ...heading,
    text('linkLabel', 'Link to all of them', { help: 'Left empty, there is no link.' }),
  ]),
  block('team', 'Team', { description: 'Everyone on the team, each linked to their page.', icon: 'users', group: 'From the CMS' }, [
    ...heading,
    text('linkLabel', 'Link to all of them', { help: 'Left empty, there is no link.' }),
  ]),
  block('reviews', 'Reviews', { description: 'What clients said, in one of four layouts.', icon: 'message-circle', group: 'From the CMS' }, [
    ...heading,
    choice('layout', 'Layout', { spotlight: 'One at a time, beside the home', cards: 'Cards', wall: 'A wall with a rating', people: 'Agents with a quote each' }),
  ]),
  block('journal', 'Guides', { description: 'The three newest guides from the blog.', icon: 'newspaper', group: 'From the CMS' }, [
    ...heading,
    text('linkLabel', 'Link to all of them', { help: 'Left empty, there is no link.' }),
  ]),
  block('photo-points', 'Photos and points', { description: 'Two photos and a figure beside a heading, short points and buttons.', icon: 'list-checks', group: 'Content' }, [
    ...heading,
    long('lead', 'Lead'),
    image('photo', 'Photo'),
    text('photoAlt', 'What the photo shows', { help: 'Read aloud to people who cannot see it.' }),
    image('secondPhoto', 'Small photo'),
    text('figure', 'Figure', { help: 'As it should read: 7% or 1,200. Left empty, there is no figure.' }),
    text('figureLabel', 'Above the figure'),
    text('figureUnit', 'Under the figure'),
    list('points', 'Points', text('point', 'Point')),
    ...button('button', 'First button'),
    ...button('second', 'Second button'),
  ]),
  block('steps', 'Steps', { description: 'Numbered steps beside a heading and a photo.', icon: 'list-ordered', group: 'Content' }, [
    ...heading,
    image('photo', 'Photo'),
    list('items', 'Steps', group('item', 'Step', [text('title', 'Name', { required: true }), long('text', 'What happens')]), { required: true }),
  ]),
  block('valuation', 'Valuation', { description: 'A field for a seller\'s address that starts a valuation, with recent results.', icon: 'badge-dollar-sign', group: 'Action' }, [
    ...heading,
    long('lead', 'Lead'),
    text('buttonLabel', 'Button words'),
    image('photo', 'Photo'),
    text('photoAlt', 'What the photo shows', { help: 'Read aloud to people who cannot see it.' }),
    choice('results', 'Recent results', { show: 'Show the last three', hide: 'Leave them out' }),
  ]),
];

const pages = {
  key: 'pages',
  // A page may sit under another: its slug can be services/roofing.
  urlPattern: '/[...slug]',
  localizedUrlPatterns: { es: '/es/[...slug]' },
  kind: 'collection',
  label: { en: 'Pages', es: 'Páginas' },
  titleField: 'title',
  fields: [
    text('title', 'Title', { required: true, help: 'The page\'s name in the browser tab and in search results.' }),
    long('description', 'Description', { help: 'One or two sentences for search results and shared links.' }),
    field('blocks')('body', 'Sections', { options: { blocks: pageBlocks } }),
  ],
  sections: [section('sections', 'Sections', ['body']), { ...section('page', 'About this page', ['title', 'description']), aside: true }],
};

/** One link of a menu: what it says, and the page or address it goes to. */
const menuLink = group('item', 'Link', [text('label', 'Label', { required: true }), field('link')('link', 'Goes to', { required: true })]);

/** One column of the large menu that opens under a header link: a heading, and links or a list the template keeps. */
const menuColumn = group('column', 'Column', [
  text('title', 'Heading', { required: true }),
  choice('show', 'Shows', { links: 'The links below', neighborhoods: 'Every neighborhood, kept up to date' }),
  list('links', 'Links', menuLink),
]);
/** A header link can open a large menu: it does when it has columns. */
const headerLink = group('item', 'Link', [
  text('label', 'Label', { required: true }),
  field('link')('link', 'Goes to', { required: true }),
  list('columns', 'Menu columns', menuColumn, { max: 3, help: 'Up to three. With columns, the link opens a large menu. Without, it is a plain link.' }),
]);

const navigation = {
  key: 'navigation',
  kind: 'single',
  label: { en: 'Navigation', es: 'Navegación' },
  fields: [
    list('header', 'Header links', headerLink, {
      help: 'The links across the top of every page, in order. With no links here, the template\'s own are shown.',
    }),
    list('footer', 'Footer links', menuLink, { help: 'The links under "Company" at the foot of every page. With no links here, the template\'s own are shown.' }),
  ],
};

export const realEstateModel = [listings, agents, neighborhoods, reviews, pages, navigation];

/** The types whose content comes from the template's own JSON files. Pages start from `samplePages`. */
export const importedTypes = ['listings', 'agents', 'neighborhoods', 'reviews'];

/**
 * The menus to start from, in the first language: the template's own links, so the site looks the
 * same until someone edits them. `page` is the slug of a page made in the editor; the link is
 * stored as that entry, so it follows the page if its address changes.
 */
export const sampleMenus = {
  header: [
    {
      label: 'Buy',
      href: '/homes-for-sale/',
      columns: [
        { title: 'Search', show: 'links', links: [
          { label: 'All homes for sale', href: '/homes-for-sale/' },
          { label: 'Open houses', href: '/homes-for-sale/?open=yes' },
          { label: 'Newest listings', href: '/homes-for-sale/?sort=listed' },
          { label: 'Rent', href: '/rentals/' },
        ] },
        { title: 'Neighborhoods', show: 'neighborhoods' },
        { title: 'Tools', show: 'links', links: [
          { label: 'Mortgage calculator', href: '/mortgage-calculator/' },
          { label: 'Schedule a tour', href: '/schedule-a-tour/' },
          { label: 'Saved homes', href: '/saved-homes/' },
          { label: 'Agents', href: '/agents/' },
        ] },
      ],
    },
    { label: 'Rent', href: '/rentals/' },
    { label: 'Sell', href: '/sell/' },
    {
      label: 'Property management',
      href: '/property-management/',
      columns: [
        { title: 'For owners', show: 'links', links: [
          { label: 'How management works', href: '/property-management/' },
          { label: 'Plans and pricing', href: '/property-management/#plans' },
          { label: 'Free rental analysis', href: '/property-management/#analysis' },
        ] },
        { title: 'For residents', show: 'links', links: [
          { label: 'Resident center', href: '/residents/' },
          { label: 'Maintenance request', href: '/residents/#maintenance' },
          { label: 'Pay rent', href: '/residents/#pay' },
          { label: 'Rent', href: '/rentals/' },
        ] },
      ],
    },
    { label: 'Agents', href: '/agents/' },
    { label: 'About', href: '/about/' },
  ],
  footer: [
    { label: 'About', href: '/about/' },
    { label: 'Agents', href: '/agents/' },
    { label: 'Why list with us', page: 'why-list-with-us' },
    { label: 'Blog', href: '/blog/' },
    { label: 'Contact', href: '/contact/' },
  ],
};

/**
 * The pages to start from: the template's own Home and About, section for section, and one more
 * made only in the editor. Written the way the site would be handed them, by key.
 */
export const samplePages = [
  {
    locale: 'en',
    slug: 'index',
    title: 'Homes for sale, rentals and property management',
    description: 'Buy, sell or rent with an independent local brokerage, and let us manage your rental. Search homes, explore neighborhoods and book a tour.',
    body: [
      { block: 'home-hero', data: { eyebrow: 'Real estate and property management', title: 'Find a place you’ll love', titleAccent: 'coming home to.', lead: 'Buy, sell or rent with a local team that knows every neighborhood, and that manages homes for owners who’d rather not take the 2 a.m. calls.', photo: 'room-living-modern', photoAlt: 'A bright, open-plan living room with modern furniture', points: ['Licensed brokerage', 'Local and independent', 'Full-service management'], listing: 'lakeshore-farmhouse' } },
      { block: 'services', data: { eyebrow: 'What we do', title: 'One team for every stage of owning a home', lead: 'Whatever brings you here, one local team handles it from the first call to the keys.', items: [
        { title: 'Buy a home', text: 'Tour on your schedule and get an agent who negotiates like it’s their own money.', icon: 'home', photo: 'home-farmhouse', linkLabel: 'Start your search', linkTo: { kind: 'address', href: '/homes-for-sale/' } },
        { title: 'Sell your home', text: 'Pricing backed by local sales, professional photos and a launch plan built to sell.', icon: 'signpost', photo: 'home-brick', linkLabel: 'Get a valuation', linkTo: { kind: 'address', href: '/sell/' } },
        { title: 'Find a rental', text: 'Browse homes and apartments, apply online and move in without the runaround.', icon: 'key', photo: 'room-living-city', linkLabel: 'Browse rentals', linkTo: { kind: 'address', href: '/rentals/' } },
        { title: 'Property management', text: 'Leasing, rent, maintenance and reporting for single-family and small multifamily owners.', icon: 'building-2', photo: 'room-kitchen-white', linkLabel: 'For owners', linkTo: { kind: 'address', href: '/property-management/' } },
      ] } },
      { block: 'listing-spotlight', data: { eyebrow: 'Featured listing', listing: 'lakeshore-farmhouse', buttonLabel: 'View the home', tourLabel: 'Schedule a tour' } },
      { block: 'listings', data: { eyebrow: 'Featured properties', title: 'Homes on the market now', show: 'both', count: '6' } },
      { block: 'photo-points', data: { eyebrow: 'Property management', title: 'Your rental, handled.', lead: 'We market your home, screen every applicant, collect rent and coordinate repairs with vetted local vendors. You get a clear monthly statement and a team that answers.', photo: 'room-kitchen-wood', photoAlt: 'A modern kitchen with wood cabinets and an island', secondPhoto: 'outdoor-pergola', figure: '7%', figureLabel: 'Full management from', figureUnit: 'of monthly rent', points: ['Tenant screening and leasing', 'Online rent collection', '24/7 maintenance line', 'Monthly owner statements', 'Vetted local vendors', 'Renewals and move-outs'], buttonLabel: 'Get a free rental analysis', buttonTo: { kind: 'address', href: '/property-management/#analysis' }, secondLabel: 'See plans and pricing', secondTo: { kind: 'address', href: '/property-management/#plans' } } },
      { block: 'neighborhoods', data: { eyebrow: 'Neighborhood guides', title: 'Explore where you could live', linkLabel: 'All neighborhoods' } },
      { block: 'steps', data: { eyebrow: 'How it works', title: 'From first call to keys in hand', photo: 'outdoor-rooftop', items: [
        { title: 'A free consultation', text: 'Tell us what you need. We’ll walk you through the market, timing and budget, with no obligation.' },
        { title: 'A plan that fits', text: 'A clear strategy for buying, selling or leasing, with every cost laid out up front.' },
        { title: 'We do the legwork', text: 'Showings, marketing, negotiation, inspections and paperwork, handled by your agent.' },
        { title: 'Keys in hand', text: 'Close with confidence. Owners can hand the home straight to our management team.' },
      ] } },
      { block: 'reviews', data: { eyebrow: 'Reviews', title: 'What our clients say', layout: 'spotlight' } },
      { block: 'valuation', data: { eyebrow: 'Thinking of selling?', title: 'Find out what your home is worth', lead: 'A free, no-obligation valuation prepared by a local agent who knows your street, not an algorithm.', buttonLabel: 'Get my valuation', photo: 'room-living-fireplace', photoAlt: 'A sunlit living room with a fireplace and a dining area', results: 'show' } },
      { block: 'journal', data: { eyebrow: 'Guides', title: 'Advice for buyers, sellers and owners', linkLabel: 'All guides' } },
      { block: 'call-to-action', data: { title: 'Ready to make a move?', lead: 'Talk to a local agent today. No pressure, just straight answers.', photo: 'home-modern', buttonLabel: 'Schedule a tour', buttonTo: { kind: 'address', href: '/schedule-a-tour/' }, secondLabel: 'Contact us', secondTo: { kind: 'address', href: '/contact/' } } },
    ],
  },
  {
    locale: 'en',
    slug: 'about',
    title: 'About us',
    description: 'An independent local brokerage that answers its own phones. Our story, what we believe and who we are.',
    body: [
      { block: 'page-hero', data: { eyebrow: 'About us', title: 'A local brokerage that answers its own phones.', lead: 'We buy, sell, lease and manage homes in the neighborhoods we live in, with a small team that knows its clients by name.', size: 'lg', background: 'glow', photo: 'room-lounge', photoAlt: 'A modern lounge with floor-to-ceiling windows' } },
      { block: 'text', data: { title: 'Why we started', layout: 'beside', body: ['[Your story. This is sample copy.] Oakhaven started with a simple idea: real estate is personal, and the people who help you should know your street, your schools and your name.', 'We stayed small on purpose. Every client works with a named agent, every owner has a named manager, and every call reaches a person.', 'Today we help people buy, sell and rent, and we look after rental homes for owners across the city.'] } },
      { block: 'feature-grid', data: { eyebrow: 'What we believe', title: 'How we work', columns: '4', tone: 'secondary', items: [
        { icon: 'handshake', title: 'Straight answers', text: 'We’ll tell you what a home is worth, even when it isn’t what you hoped.' },
        { icon: 'map', title: 'Truly local', text: 'We work where we live, so we know which streets flood and where the good coffee is.' },
        { icon: 'message-circle', title: 'We pick up', text: 'A real person answers, and we call back the same day.' },
        { icon: 'shield-check', title: 'Fair to everyone', text: 'Fair housing isn’t a box we tick. It’s how we screen, show and sell.' },
      ] } },
      { block: 'team', data: { eyebrow: 'The team', title: 'The people you’ll work with', linkLabel: 'Meet everyone' } },
      { block: 'reviews', data: { eyebrow: 'Reviews', title: 'Our agents, in their clients’ words', layout: 'people' } },
      { block: 'call-to-action', data: { title: 'Let’s talk', lead: 'Whatever you’re planning, we’re happy to help you think it through.', buttonLabel: 'Contact us', buttonTo: { kind: 'address', href: '/contact/' }, secondLabel: 'Browse homes', secondTo: { kind: 'address', href: '/homes-for-sale/' } } },
    ],
  },
  {
    locale: 'en',
    slug: 'why-list-with-us',
    title: 'Why list with us',
    description: 'What selling your home with Oakhaven looks like: local agents, honest pricing and a plan for every week on the market.',
    body: [
      { block: 'page-hero', data: { eyebrow: 'Selling', title: 'Why list with us', lead: 'A home sells once. We plan every week of it with you, from the first walk-through to the day you hand over the keys.', size: 'lg', background: 'glow', photo: 'home-farmhouse', photoAlt: 'A white farmhouse with a deep front porch' } },
      { block: 'stats', data: { tone: 'invert', items: [{ value: '18 days', label: 'Median time on the market' }, { value: '101%', label: 'Of asking price, on average' }, { value: '640', label: 'Homes sold since 2012' }, { value: '4.9', label: 'Average review from sellers' }] } },
      { block: 'feature-grid', data: { eyebrow: 'How we work', title: 'What you can count on', columns: '4', tone: 'secondary', items: [
        { icon: 'badge-dollar-sign', title: 'A price you can defend', text: 'We show you every comparable sale and how we weighed it.' },
        { icon: 'calendar-check', title: 'A plan for each week', text: 'Photos, launch, open houses and a review of the offers, on dates you agree to.' },
        { icon: 'message-circle', title: 'An answer the same day', text: 'Your agent picks up, and tells you what every showing said.' },
        { icon: 'shield-check', title: 'No surprises at closing', text: 'You see your net proceeds before you list, and again with every offer.' },
      ] } },
      { block: 'feature-split', data: { eyebrow: 'Before you list', title: 'We get the house ready with you', body: ['Most homes sell faster after a week of small work: paint, light, and a clear room or two. We walk the house with you, say what is worth doing, and bring the people who do it.', 'Then we photograph it in the right light, and it goes live on a Thursday, when buyers plan their weekend.'], photo: 'room-kitchen-white', photoAlt: 'A bright kitchen with white cabinets', photoSide: 'right', buttonLabel: 'Ask for a walk-through', buttonTo: { kind: 'address', href: '/contact/' } } },
      { block: 'questions', data: { title: 'What sellers ask first', items: [
        { question: 'What does it cost to list?', answer: 'Our fee is a share of the sale price, agreed before you sign and paid at closing. There is nothing to pay up front.' },
        { question: 'How long is the agreement?', answer: 'Ninety days. If we have not done what the plan says, you can end it sooner.' },
        { question: 'Do I have to leave for showings?', answer: 'It helps. Buyers stay longer and say more when the owner is out, and we give you a day\'s notice.' },
      ] } },
      { block: 'call-to-action', data: { title: 'Find out what your home could sell for', lead: 'A free, written estimate from an agent who knows your street.', photo: 'home-modern', buttonLabel: 'Talk to an agent', buttonTo: { kind: 'address', href: '/contact/' }, secondLabel: 'See recent sales', secondTo: { kind: 'address', href: '/homes-for-sale/' } } },
    ],
  },
  // The same two pages in Spanish, from the template's own Spanish copy. `translates` names the
  // English page each belongs with when its slug differs.
  {
    locale: 'es',
    slug: 'index',
    title: 'Casas en venta, alquileres y administración de propiedades',
    description: 'Compre, venda o alquile con una inmobiliaria local independiente, y deje que administremos su propiedad. Busque casas, explore barrios y agende una visita.',
    body: [
      { block: 'home-hero', data: { eyebrow: 'Inmobiliaria y administración de propiedades', title: 'Encuentre un lugar al que', titleAccent: 'le encante volver.', lead: 'Compre, venda o alquile con un equipo local que conoce cada barrio, y que administra casas para los propietarios que prefieren no atender llamadas a las 2 de la madrugada.', photo: 'room-living-modern', photoAlt: 'Una sala luminosa y abierta con muebles modernos', points: ['Inmobiliaria con licencia', 'Local e independiente', 'Administración integral'], listing: 'lakeshore-farmhouse' } },
      { block: 'services', data: { eyebrow: 'Lo que hacemos', title: 'Un solo equipo para cada etapa', lead: 'Venga por lo que venga, un mismo equipo local se encarga de todo, de la primera llamada a las llaves.', items: [
        { title: 'Comprar una casa', text: 'Visite casas a su ritmo, con un agente que negocia como si fuera su propio dinero.', icon: 'home', photo: 'home-farmhouse', linkLabel: 'Empezar a buscar', linkTo: { kind: 'address', href: '/es/casas-en-venta/' } },
        { title: 'Vender su casa', text: 'Un precio basado en ventas locales, fotos profesionales y un plan de lanzamiento pensado para vender.', icon: 'signpost', photo: 'home-brick', linkLabel: 'Pedir valoración', linkTo: { kind: 'address', href: '/es/vender/' } },
        { title: 'Encontrar un alquiler', text: 'Vea casas y apartamentos, presente la solicitud en línea y múdese sin complicaciones.', icon: 'key', photo: 'room-living-city', linkLabel: 'Ver alquileres', linkTo: { kind: 'address', href: '/es/alquileres/' } },
        { title: 'Administración', text: 'Arrendamiento, cobro, mantenimiento e informes para propietarios de casas y pequeños edificios.', icon: 'building-2', photo: 'room-kitchen-white', linkLabel: 'Para propietarios', linkTo: { kind: 'address', href: '/es/administracion-de-propiedades/' } },
      ] } },
      { block: 'listing-spotlight', data: { eyebrow: 'Propiedad destacada', listing: 'lakeshore-farmhouse', buttonLabel: 'Ver la casa', tourLabel: 'Agendar una visita' } },
      { block: 'listings', data: { eyebrow: 'Propiedades destacadas', title: 'Casas en el mercado ahora', show: 'both', count: '6' } },
      { block: 'photo-points', data: { eyebrow: 'Administración de propiedades', title: 'Su alquiler, resuelto.', lead: 'Promocionamos su casa, evaluamos a cada solicitante, cobramos el alquiler y coordinamos reparaciones con proveedores locales de confianza. Usted recibe un estado mensual claro y un equipo que contesta.', photo: 'room-kitchen-wood', photoAlt: 'Una cocina moderna con armarios de madera y una isla', secondPhoto: 'outdoor-pergola', figure: '7%', figureLabel: 'Administración integral desde', figureUnit: 'de la renta mensual', points: ['Evaluación y arrendamiento', 'Cobro del alquiler en línea', 'Mantenimiento 24/7', 'Estados mensuales', 'Proveedores de confianza', 'Renovaciones y mudanzas'], buttonLabel: 'Pedir un análisis de alquiler', buttonTo: { kind: 'address', href: '/es/administracion-de-propiedades/#analysis' }, secondLabel: 'Ver planes y precios', secondTo: { kind: 'address', href: '/es/administracion-de-propiedades/#plans' } } },
      { block: 'neighborhoods', data: { eyebrow: 'Guías de barrios', title: 'Descubra dónde podría vivir', linkLabel: 'Todos los barrios' } },
      { block: 'steps', data: { eyebrow: 'Cómo funciona', title: 'De la llamada a las llaves', photo: 'outdoor-rooftop', items: [
        { title: 'Una consulta gratuita', text: 'Cuéntenos qué necesita. Le explicaremos el mercado, los plazos y el presupuesto, sin compromiso.' },
        { title: 'Un plan a su medida', text: 'Una estrategia clara para comprar, vender o alquilar, con todos los costos desde el principio.' },
        { title: 'Nosotros hacemos el trabajo', text: 'Visitas, promoción, negociación, inspecciones y papeleo, a cargo de su agente.' },
        { title: 'Las llaves en la mano', text: 'Cierre con tranquilidad. Si es propietario, puede pasar la casa directamente a nuestro equipo de administración.' },
      ] } },
      { block: 'reviews', data: { eyebrow: 'Reseñas', title: 'Lo que dicen nuestros clientes', layout: 'spotlight' } },
      { block: 'valuation', data: { eyebrow: '¿Piensa vender?', title: 'Descubra cuánto vale su casa', lead: 'Una valoración gratuita y sin compromiso, preparada por un agente local que conoce su calle, no por un algoritmo.', buttonLabel: 'Quiero mi valoración', photo: 'room-living-fireplace', photoAlt: 'Una sala soleada con chimenea y comedor', results: 'show' } },
      { block: 'journal', data: { eyebrow: 'Guías', title: 'Consejos para comprar, vender y alquilar', linkLabel: 'Todas las guías' } },
      { block: 'call-to-action', data: { title: '¿Listo para dar el paso?', lead: 'Hable hoy con un agente local. Sin presiones, solo respuestas claras.', photo: 'home-modern', buttonLabel: 'Agendar una visita', buttonTo: { kind: 'address', href: '/es/agendar-visita/' }, secondLabel: 'Contáctenos', secondTo: { kind: 'address', href: '/es/contacto/' } } },
    ],
  },
  {
    locale: 'es',
    slug: 'nosotros',
    translates: 'about',
    title: 'Quiénes somos',
    description: 'Una inmobiliaria local independiente que contesta su propio teléfono. Nuestra historia, en qué creemos y quiénes somos.',
    body: [
      { block: 'page-hero', data: { eyebrow: 'Quiénes somos', title: 'Una inmobiliaria local que contesta su propio teléfono.', lead: 'Compramos, vendemos, alquilamos y administramos casas en los barrios donde vivimos, con un equipo pequeño que conoce a sus clientes por su nombre.', size: 'lg', background: 'glow', photo: 'room-lounge', photoAlt: 'Una sala moderna con ventanales de piso a techo' } },
      { block: 'text', data: { title: 'Por qué empezamos', layout: 'beside', body: ['[Su historia. Este es un texto de ejemplo.] Oakhaven nació de una idea sencilla: el sector inmobiliario es personal, y quienes le ayudan deberían conocer su calle, sus escuelas y su nombre.', 'Seguimos siendo pequeños a propósito. Cada cliente trabaja con un agente concreto, cada propietario con un administrador concreto, y cada llamada la contesta una persona.', 'Hoy ayudamos a comprar, vender y alquilar, y cuidamos casas en alquiler para propietarios de toda la ciudad.'] } },
      { block: 'feature-grid', data: { eyebrow: 'En qué creemos', title: 'Cómo trabajamos', columns: '4', tone: 'secondary', items: [
        { icon: 'handshake', title: 'Respuestas claras', text: 'Le diremos cuánto vale una casa, aunque no sea lo que esperaba.' },
        { icon: 'map', title: 'De verdad locales', text: 'Trabajamos donde vivimos, así que sabemos qué calles se inundan y dónde hay buen café.' },
        { icon: 'message-circle', title: 'Contestamos', text: 'Responde una persona real, y devolvemos las llamadas el mismo día.' },
        { icon: 'shield-check', title: 'Justos con todos', text: 'La vivienda justa no es un trámite: es cómo evaluamos, mostramos y vendemos.' },
      ] } },
      { block: 'team', data: { eyebrow: 'El equipo', title: 'Las personas con las que trabajará', linkLabel: 'Conocer a todos' } },
      { block: 'reviews', data: { eyebrow: 'Reseñas', title: 'Nuestros agentes, en palabras de sus clientes', layout: 'people' } },
      { block: 'call-to-action', data: { title: 'Hablemos', lead: 'Sea lo que sea que esté planeando, con gusto le ayudamos a pensarlo.', buttonLabel: 'Contáctenos', buttonTo: { kind: 'address', href: '/es/contacto/' }, secondLabel: 'Ver casas', secondTo: { kind: 'address', href: '/es/casas-en-venta/' } } },
    ],
  },
];
