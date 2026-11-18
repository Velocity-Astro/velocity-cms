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

export const realEstateModel = [listings, agents, neighborhoods, reviews];
