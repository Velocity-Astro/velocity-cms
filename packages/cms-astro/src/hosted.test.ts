import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { APIContext } from 'astro';
import { PreviewLinks, readImage, type Actor } from '@velocity-astro/cms-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sharedConnection } from './connection.js';
import { NoSiteError, currentSite, hostedRequest, inSite, readInSite, siteAt, siteCacheTag, useSiteRegistry, type HostedSite } from './hosted.js';
import velocityCms from './integration.js';
import { cmsLiveLoader } from './live-loader.js';
import { FolderMediaStore } from './media-store.js';
import { onRequest as previewRequest } from './preview.js';
import { hasSiteSecret, siteSecret } from './secret.js';
import { editorOrigin, pagesOrigin } from './site-editor.js';
import { refreshUploadedImages, uploadedFile } from './site-media.js';
import { siteLikePosts } from './site-likes.js';

const owner: Actor = { kind: 'cli', id: 'installer', role: 'owner' };
const settings = { site: 'https://the-template.example', dev: false };

let directory: string;
let harbor: HostedSite;
let orchard: HostedSite;

const site = (id: string, host: string): HostedSite => ({
  id,
  origin: `https://${host}`,
  database: { url: `file:${path.join(directory, id, 'data.db')}` },
  secret: `${id}-secret-that-is-long-enough-0123456789`,
  name: id,
  media: new FolderMediaStore(path.join(directory, id, 'media')),
});

/** One page type with one published page, whose title says whose it is. */
async function fill(title: string): Promise<void> {
  const { cms } = await sharedConnection({});
  const pages = await cms.schema.define(owner, {
    key: 'pages',
    kind: 'collection',
    label: { en: 'Pages' },
    urlPattern: '/[slug]',
    fields: [{ key: 'title', type: 'text', label: { en: 'Title' }, required: true }],
  });
  const [name] = pages.fields;
  if (!name) throw new Error('The pages type is not as described.');
  const entry = await cms.content.create(owner, { typeId: pages.id, locale: 'en', slug: 'about', data: { [name.id]: title } });
  await cms.content.publish(owner, entry.id);
}

const titles = async (): Promise<unknown[]> => {
  const loaded = await cmsLiveLoader({ type: 'pages' }).loadCollection({ filter: undefined } as never);
  if ('error' in loaded) throw loaded.error;
  return loaded.entries.map((entry) => entry.data['title']);
};

/** A request as the middleware meets it. `tags` gathers what the page would be kept under. */
function asked(address: string, init: RequestInit = {}) {
  const tags: string[] = [];
  let kept = true;
  const url = new URL(address);
  const context = {
    request: new Request(url, init),
    url,
    isPrerendered: false,
    cache: {
      set: (rule: false | { tags?: string[] }) => {
        if (rule === false) kept = false;
        else tags.push(...(rule.tags ?? []));
      },
    },
  } as unknown as APIContext;
  return { context, tags, isKept: () => kept };
}

beforeEach(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'velocity-cms-hosted-'));
  harbor = site('harbor', 'harbor.example');
  orchard = site('orchard', 'orchard.example');
  const known = new Map([['harbor.example', harbor], ['orchard.example', orchard]]);
  useSiteRegistry({ find: (host) => known.get(host) ?? null });
  await inSite(harbor, () => fill('Harbor Realty'));
  await inSite(orchard, () => fill('Orchard Dental'));
});

afterEach(() => {
  useSiteRegistry(undefined);
  delete process.env.VELOCITY_CMS_SECRET;
  delete process.env.VELOCITY_CMS_DATABASE_URL;
  delete process.env.VELOCITY_CMS_ORIGIN;
});

describe('a server that runs many sites', () => {
  it('reads each site\'s content from its own database', async () => {
    expect(await inSite(harbor, titles)).toEqual(['Harbor Realty']);
    expect(await inSite(orchard, titles)).toEqual(['Orchard Dental']);
  });

  it('tags what the live loader hands out with its own site, so that site\'s publish clears the page', async () => {
    const tagsOf = async () => {
      const loaded = await cmsLiveLoader({ type: 'pages' }).loadCollection({ filter: undefined } as never);
      if ('error' in loaded) throw loaded.error;
      return { list: loaded.cacheHint?.tags ?? [], entry: loaded.entries[0]?.cacheHint?.tags ?? [] };
    };
    const atHarbor = await inSite(harbor, tagsOf);
    const atOrchard = await inSite(orchard, tagsOf);
    expect(atHarbor.list).toContain(`cms-site:${harbor.id}`);
    expect(atHarbor.entry).toContain(`cms-site:${harbor.id}`);
    expect(atOrchard.entry).toContain(`cms-site:${orchard.id}`);
    expect(atOrchard.entry).not.toContain(`cms-site:${harbor.id}`);
  });

  it('opens the site\'s own database whatever a template asks for', async () => {
    const other = `file:${path.join(directory, 'orchard', 'data.db')}`;
    const loaded = await inSite(harbor, () => cmsLiveLoader({ type: 'pages', url: other }).loadCollection({ filter: undefined } as never));
    expect('entries' in loaded && loaded.entries.map((entry) => entry.data['title'])).toEqual(['Harbor Realty']);
  });

  it('reads nothing for work that was begun for no site', async () => {
    // The settings of a single site are there, and must not be fallen back to.
    process.env.VELOCITY_CMS_DATABASE_URL = harbor.database.url;
    process.env.VELOCITY_CMS_SECRET = harbor.secret;
    expect(() => currentSite()).toThrow(NoSiteError);
    expect(() => siteSecret()).toThrow(NoSiteError);
    await expect((async () => sharedConnection({}))()).rejects.toThrow(NoSiteError);
    const loaded = await cmsLiveLoader({ type: 'pages' }).loadCollection({ filter: undefined } as never);
    expect('error' in loaded && loaded.error).toBeInstanceOf(NoSiteError);
  });

  it('gives a host name it does not know no site at all', async () => {
    let drawn = false;
    const { context } = asked('https://elsewhere.example/about');
    const response = (await hostedRequest(context, async () => ((drawn = true), new Response('page')))) as Response;
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(drawn).toBe(false);
    expect(await siteAt('HARBOR.example')).toBe(harbor);
  });

  it('draws a page for the site at the request\'s host, to the end of the page', async () => {
    const { context, tags } = asked('https://orchard.example/about');
    const encoder = new TextEncoder();
    const response = (await hostedRequest(context, async () => {
      // Astro draws the rest of a page as the response is read, after the middleware returned.
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          controller.enqueue(encoder.encode((await titles()).join()));
          controller.close();
        },
      });
      return new Response(body);
    })) as Response;
    expect(await response.text()).toBe('Orchard Dental');
    expect(tags).toEqual(['cms-site:orchard']);
  });

  it('keeps the site while a page is read outside it', async () => {
    // Nothing is drawn until it is asked for, as with a page that is drawn while it is read.
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          controller.enqueue(new TextEncoder().encode(currentSite()?.id ?? 'none'));
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    expect(await readInSite(harbor, new Response(body)).text()).toBe('harbor');
  });

  it('clears only its own site\'s kept pages on a publish', () => {
    expect(inSite(harbor, siteCacheTag)).toBe('cms-site:harbor');
    expect(inSite(orchard, siteCacheTag)).toBe('cms-site:orchard');
  });

  it('makes links for the address the registry keeps, never the request\'s or the template\'s', () => {
    process.env.VELOCITY_CMS_ORIGIN = 'https://one-site.example';
    const request = new Request('https://harbor.example/admin', { headers: { host: 'attacker.example' } });
    expect(inSite(harbor, () => editorOrigin(request, settings))).toBe('https://harbor.example');
    expect(inSite(harbor, () => pagesOrigin(request, settings))).toBe('https://harbor.example');
  });

  it('counts a like on its own site only, from that site\'s pages only', async () => {
    const likeAt = async (host: HostedSite, from: string) =>
      inSite(host, async () => {
        const { cms } = await sharedConnection({});
        const pages = await cms.schema.getByKey('pages');
        await cms.schema.update(owner, pages.id, { likes: { showCount: true } });
        const request = new Request(`${host.origin}/api/cms/likes`, { method: 'POST', headers: { origin: from, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'pages', entry: 'en/about', browser: 'hosted-check-browser-01', liked: true }) });
        return (await siteLikePosts(settings)).handle(request);
      });
    expect((await likeAt(harbor, 'https://orchard.example')).status).toBe(403);
    expect(await (await likeAt(harbor, 'https://harbor.example')).json()).toEqual({ liked: true, count: 1 });
    expect(await (await likeAt(orchard, 'https://orchard.example')).json()).toEqual({ liked: true, count: 1 });
    expect(await (await likeAt(harbor, 'https://harbor.example')).json()).toEqual({ liked: true, count: 1 });
  });

  it('takes one site\'s secret for that site only', () => {
    const bearer = (secret: string) => new Request('https://harbor.example/api/cms/schedule', { headers: { authorization: `Bearer ${secret}` } });
    expect(inSite(harbor, () => hasSiteSecret(bearer(harbor.secret)))).toBe(true);
    expect(inSite(orchard, () => hasSiteSecret(bearer(harbor.secret)))).toBe(false);
  });

  it('shows a preview only on the site whose secret signed the link', async () => {
    const token = await new PreviewLinks(harbor.secret).issue();
    const preview = async (host: HostedSite, name: string) => {
      const { context, isKept } = asked(`https://${name}/about?preview=${token}`);
      const response = (await hostedRequest(context, () => previewRequest(context, async () => new Response('page')) as Promise<Response>)) as Response;
      await response.text();
      return { kept: isKept(), robots: response.headers.get('x-robots-tag') };
    };
    expect(await preview(harbor, 'harbor.example')).toEqual({ kept: false, robots: 'noindex' });
    expect(await preview(orchard, 'orchard.example')).toEqual({ kept: true, robots: null });
  });

  it('builds no page ahead of time, since such a page would be every site\'s', () => {
    const setUp = (options: Parameters<typeof velocityCms>[0]) => {
      const page = { component: 'src/pages/blog.astro', prerender: true };
      const hook = velocityCms(options).hooks['astro:route:setup'] as unknown as (given: { route: typeof page }) => void;
      hook({ route: page });
      return page.prerender;
    };
    expect(setUp({ sites: './src/cms-sites.ts' })).toBe(false);
    // A site of its own builds what it chooses to.
    expect(setUp({})).toBe(true);
  });

  it('lets a page built ahead of time through, though it is built for no site', async () => {
    const { context } = asked('https://the-template.example/blog/');
    Object.assign(context, { isPrerendered: true });
    const drawn = async () => new Response('page');
    const response = (await hostedRequest(context, () => previewRequest(context, drawn) as Promise<Response>)) as Response;
    expect(await response.text()).toBe('page');
  });

  it('keeps and serves each site\'s uploads apart', async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    await harbor.media?.put('porch.png', { bytes: png, contentType: 'image/png' });
    expect(await orchard.media?.get('porch.png')).toBeNull();
    await inSite(orchard, () => refreshUploadedImages());
    expect((await inSite(orchard, () => uploadedFile('porch.png'))).status).toBe(404);
  });

  it('keeps an upload as a lighter WebP, and serves small copies of it to its own site alone', async () => {
    const { default: sharp } = await import('sharp');
    const jpeg = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg().toBuffer();
    const image = await inSite(harbor, async () => (await sharedConnection({})).cms.media.upload(owner, { fileName: 'Porch.jpg', bytes: jpeg }));
    expect(image).toMatchObject({ url: '/media/porch.webp', width: 2560, height: 1707, thumbnail: '/media/porch.webp?w=640' });
    expect(await harbor.media?.get('porch.jpg')).toBeNull();

    const small = await inSite(harbor, () => uploadedFile('porch.webp', '640'));
    expect(small.headers.get('content-type')).toBe('image/webp');
    expect(small.headers.get('cache-control')).toContain('immutable');
    expect(readImage(new Uint8Array(await small.arrayBuffer()))).toMatchObject({ width: 640, height: 427 });
    // Only the widths the CMS offers, so nobody can ask for one image ten thousand ways.
    for (const width of ['641', '0', '99999', '640px', '']) {
      expect((await inSite(harbor, () => uploadedFile('porch.webp', width))).status).toBe(404);
    }
    expect((await inSite(orchard, () => uploadedFile('porch.webp', '640'))).status).toBe(404);
  });

  it('refuses a site the registry describes badly', async () => {
    useSiteRegistry({ find: () => ({ ...harbor, secret: 'short' }) });
    await expect(siteAt('harbor.example')).rejects.toThrow('shorter than 32');
    useSiteRegistry({ find: () => ({ ...harbor, id: '../orchard' }) });
    await expect(siteAt('harbor.example')).rejects.toThrow('cannot be a site\'s id');
  });
});

describe('a server that runs one site', () => {
  it('reads its settings from the environment, as ever', async () => {
    useSiteRegistry(undefined);
    process.env.VELOCITY_CMS_SECRET = 'one-site-secret-that-is-long-enough-012345';
    expect(currentSite()).toBeUndefined();
    expect(siteSecret()).toBe('one-site-secret-that-is-long-enough-012345');
    expect(siteCacheTag()).toBe('cms');
    let drawn = false;
    const { context, tags } = asked('https://anything.example/');
    await hostedRequest(context, async () => ((drawn = true), new Response('page')));
    expect(drawn).toBe(true);
    expect(tags).toEqual([]);
  });
});
