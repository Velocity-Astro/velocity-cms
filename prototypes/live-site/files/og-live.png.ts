import type { APIRoute } from 'astro';
import { readPage, renderCard } from '../../../integrations/og-images.mjs';

export const prerender = false;

/**
 * The share image of a live page, drawn the first time someone asks for it and then cached like
 * the page itself. It reads the page's own title and description, as the build step did.
 */
export const GET: APIRoute = async ({ params, url, site }) => {
  const slug = params.live ?? '';
  const pagePath = slug === 'index' ? '/' : slug.endsWith('/index') ? `/${slug.slice(0, -'index'.length)}` : `/${slug}/`;
  const page = await fetch(new URL(pagePath, url.origin));
  if (!page.ok) return new Response(null, { status: 404 });

  const details = readPage(await page.text());
  if (!details.image || new URL(details.image).pathname !== url.pathname) return new Response(null, { status: 404 });

  const png = await renderCard({
    title: details.title,
    description: details.description,
    siteName: details.siteName,
    hostname: (site ?? url).host,
    themeColor: details.themeColor,
  });
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
