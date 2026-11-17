import { expect, it } from 'vitest';
import { liveAddresses, matchLocalizedPage, matchParams } from './live-pages.js';
import { toSearchDocument } from './site-search.js';

const about = { default: 'About', getStaticPaths: () => [{ params: { lang: 'es', about: 'sobre-nosotros' }, props: { locale: 'es' } }] };
const home = { default: 'Home', getStaticPaths: () => [{ params: { lang: 'es', home: undefined } }] };
const listing = {
  default: 'Listing',
  getStaticPaths: async () => [{ params: { lang: 'es', listing: 'propiedades/casa-del-lago' }, props: { id: 1 } }],
};
const pages = { '/a.astro': about, '/b.astro': home, '/c.astro': listing };

it('finds the path a request asks for, treating a missing param as empty', () => {
  const paths = [{ params: { slug: 'a' }, props: { n: 1 } }, { params: { slug: undefined }, props: { n: 2 } }];
  expect(matchParams(paths, { slug: 'a' })?.props).toEqual({ n: 1 });
  expect(matchParams(paths, {})?.props).toEqual({ n: 2 });
  expect(matchParams(paths, { slug: 'zzz' })).toBeUndefined();
});

it('picks the translated page that owns an address, and none when nobody does', async () => {
  expect(await matchLocalizedPage(pages, 'es', 'sobre-nosotros')).toEqual({ Page: 'About', props: { locale: 'es' } });
  expect(await matchLocalizedPage(pages, 'es', undefined)).toEqual({ Page: 'Home', props: {} });
  expect((await matchLocalizedPage(pages, 'es', 'propiedades/casa-del-lago'))?.Page).toBe('Listing');
  expect(await matchLocalizedPage(pages, 'es', 'nope')).toBeUndefined();
  expect(await matchLocalizedPage(pages, 'fr', 'sobre-nosotros')).toBeUndefined();
  expect(await matchLocalizedPage(pages, undefined, undefined)).toBeUndefined();
});

it('lists every live address once, in order, and marks fixed and unlisted ones', async () => {
  const addresses = await liveAddresses({
    fixed: ['/src/pages/index.astro', '/src/pages/about.astro', '/src/pages/search.astro', '/src/pages/404.astro'],
    detail: { '/src/pages/listings/[slug].astro': { default: 0, livePaths: () => [{ params: { slug: 'lake-house' } }] } },
    localized: pages,
    unlisted: ['/search/'],
  });
  expect(addresses).toEqual([
    { path: '/', fixed: true, listed: true },
    { path: '/about/', fixed: true, listed: true },
    { path: '/es/', fixed: false, listed: true },
    { path: '/es/propiedades/casa-del-lago/', fixed: false, listed: true },
    { path: '/es/sobre-nosotros/', fixed: false, listed: true },
    { path: '/listings/lake-house/', fixed: false, listed: true },
    { path: '/search/', fixed: true, listed: false },
  ]);
});

it('reads the searchable part of a page as plain text', () => {
  const html = `<html lang="es-ES"><head><title>Tab title</title><style>h1{}</style></head><body><nav>Menu</nav>
    <main><div data-pagefind-body><h1>Casa <em>del</em> Lago</h1><p>Jard&#xed;n &amp; p&#233;rgola</p>
    <script>ignored()</script><svg><title>icon</title></svg></div></main><footer>Footer</footer></body></html>`;
  expect(toSearchDocument('/es/casa/', html)).toEqual({
    id: 'page:/es/casa/',
    locale: 'es-ES',
    url: '/es/casa/',
    title: 'Casa del Lago',
    body: 'Casa del Lago Jardín & pérgola',
  });
  expect(toSearchDocument('/search/', '<html lang="en"><main><h1>Search</h1></main></html>')).toBeNull();
});
