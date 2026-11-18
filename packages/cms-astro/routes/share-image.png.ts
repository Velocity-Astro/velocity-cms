import type { APIRoute } from 'astro';
// Velocity's own card drawing, from the site: the live card is the same one the build draws.
import { readPage, renderCard } from '/integrations/og-images.mjs';
import { ownOrigin } from './editor.ts';

export const prerender = false;

/**
 * The share image of a live page, drawn the first time someone asks for it and then cached like
 * the page itself. It reads the page's own title and description, as the build step did.
 */
export const GET: APIRoute = async ({ params, request, url, site }) => {
  const slug = params.live ?? '';
  const pagePath = slug === 'index' ? '/' : slug.endsWith('/index') ? `/${slug.slice(0, -'index'.length)}` : `/${slug}/`;
  // The page is read from the site itself, never from an address the request chose.
  const origin = ownOrigin(request);
  const target = origin === null ? null : new URL(pagePath, origin);
  if (target === null || target.origin !== origin) return new Response(null, { status: 404 });
  const page = await fetch(target);
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
