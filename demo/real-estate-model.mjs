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
  'calendar-check': 'Calendar', 'badge-dollar-sign': 'Price', 'trending-up': 'Rising line', users: 'People', star: 'Star', clock: 'Clock', phone: 'Phone', 'file-text': 'Document',
};
const button = (prefix, label) => [
  text(`${prefix}Label`, `${label} words`),
  text(`${prefix}Link`, `${label} link`, { help: 'A page of this site, such as /contact/, or a full address starting with https://.' }),
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

const navigation = {
  key: 'navigation',
  kind: 'single',
  label: { en: 'Navigation', es: 'Navegación' },
  fields: [
    list('header', 'Header links', menuLink, {
      help: 'The links across the top of every page, in order. A link to Homes for sale or to Property management keeps its menu. With no links here, the template\'s own are shown.',
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
    { label: 'Buy', href: '/homes-for-sale/' },
    { label: 'Rent', href: '/rentals/' },
    { label: 'Sell', href: '/sell/' },
    { label: 'Property management', href: '/property-management/' },
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

/** A page to start from, so the editor has one to open: written the way the site would be handed it, by key. */
export const samplePages = [
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
      { block: 'feature-split', data: { eyebrow: 'Before you list', title: 'We get the house ready with you', body: ['Most homes sell faster after a week of small work: paint, light, and a clear room or two. We walk the house with you, say what is worth doing, and bring the people who do it.', 'Then we photograph it in the right light, and it goes live on a Thursday, when buyers plan their weekend.'], photo: 'room-kitchen-white', photoAlt: 'A bright kitchen with white cabinets', photoSide: 'right', buttonLabel: 'Ask for a walk-through', buttonLink: '/contact/' } },
      { block: 'questions', data: { title: 'What sellers ask first', items: [
        { question: 'What does it cost to list?', answer: 'Our fee is a share of the sale price, agreed before you sign and paid at closing. There is nothing to pay up front.' },
        { question: 'How long is the agreement?', answer: 'Ninety days. If we have not done what the plan says, you can end it sooner.' },
        { question: 'Do I have to leave for showings?', answer: 'It helps. Buyers stay longer and say more when the owner is out, and we give you a day\'s notice.' },
      ] } },
      { block: 'call-to-action', data: { title: 'Find out what your home could sell for', lead: 'A free, written estimate from an agent who knows your street.', photo: 'home-modern', buttonLabel: 'Talk to an agent', buttonLink: '/contact/', secondLabel: 'See recent sales', secondLink: '/homes-for-sale/' } },
    ],
  },
];
