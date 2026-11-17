import type { APIRoute } from 'astro';
import { liveAddresses } from '@/lib/live-site';

export const prerender = false;

/** The live pages' share of the sitemap. `sitemap-index.xml` points here and at the built one. */
export const GET: APIRoute = async ({ site }) => {
  const urls = (await liveAddresses())
    .filter((address) => address.listed && !address.fixed)
    .map((address) => `<url><loc>${new URL(address.path, site).href}</loc></url>`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
