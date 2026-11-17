import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * The browser side of search. It offers the two calls Velocity's search page used from Pagefind
 * and asks the site instead of downloading an index, so the search page itself does not change.
 */
const SCRIPT = `
export async function search(query) {
  const address = '/api/cms/search.json?q=' + encodeURIComponent(query) + '&lang=' + encodeURIComponent(document.documentElement.lang);
  const { total, hits } = await (await fetch(address)).json();
  // The page counts results and reads the first ten, so the list is as long as the total.
  const results = Array.from({ length: total }, (_, position) => ({
    id: hits[position]?.id,
    data: async () => {
      const hit = hits[position];
      return hit && { url: hit.url, excerpt: hit.excerpt, meta: { title: hit.title } };
    },
  }));
  return { results };
}

let latest = 0;
export async function debouncedSearch(query, _options, wait = 200) {
  const mine = ++latest;
  await new Promise((resolve) => setTimeout(resolve, wait));
  return mine === latest ? search(query) : null;
}
`;

export const GET: APIRoute = () =>
  new Response(SCRIPT, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
