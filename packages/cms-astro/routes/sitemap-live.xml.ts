import type { APIRoute } from 'astro';
import { addresses } from './pages.ts';

export const prerender = false;

/** The live pages' share of the sitemap. Point `sitemap-index.xml` here with `customSitemaps`. */
export const GET: APIRoute = async ({ site, url }) => {
  const urls = (await addresses())
    .filter((address) => address.listed && !address.fixed)
    .map((address) => `<url><loc>${new URL(address.path, site ?? url).href}</loc></url>`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
