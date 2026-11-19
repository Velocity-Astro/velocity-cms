import { AsyncLocalStorage } from 'node:async_hooks';
import type { MiddlewareHandler } from 'astro';
import type { MediaStore } from '@velocity-astro/cms-core';

/**
 * One site among many that a single running copy of a template serves. Everything that sets one
 * site apart from the next is here: nothing of a hosted site is read from the environment.
 */
export interface HostedSite {
  /** The site's permanent name with its host: letters, digits and dashes. It is never shown. */
  readonly id: string;
  /** The address links, sign-in and passkeys are made for: `https://example.com`. */
  readonly origin: string;
  /** The site's own database. No two sites share one. */
  readonly database: { readonly url: string; readonly authToken?: string };
  /** The site's own secret, at least 32 characters. It signs previews and seals plugin secrets. */
  readonly secret: string;
  /** The site's name, shown in the editor and in sign-in emails. */
  readonly name?: string;
  /** Where the site's uploads are kept, apart from every other site's. Without it the site takes none. */
  readonly media?: MediaStore;
}

/**
 * How a host that runs many sites tells them apart. The registry, and nothing a visitor sends,
 * decides which site an address belongs to: a host name it does not know has no site.
 */
export interface SiteRegistry {
  /** The site at this host name (`example.com`, `example.com:8080`), or `null` when there is none. */
  find(host: string): Promise<HostedSite | null> | HostedSite | null;
}

/** A request, or other work, reached for a site's content when no site was chosen for it. */
export class NoSiteError extends Error {
  constructor() {
    super('This server runs many sites, and this work was not begun for any one of them. Content is read only inside a request for a known site.');
  }
}

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const current = new AsyncLocalStorage<HostedSite>();
let registry: SiteRegistry | undefined;

/**
 * Tells the CMS that this server runs many sites. From then on nothing is read for "the" site.
 * `undefined` takes it back, which only a test does.
 */
export function useSiteRegistry(sites: SiteRegistry | undefined): void {
  registry = sites;
}

/** Whether this server runs many sites. */
export const isHosted = (): boolean => registry !== undefined;

/**
 * The site this work is for. `undefined` on a server that runs one site, which reads its
 * settings from the environment as ever. On a server that runs many, work begun for no site
 * throws: it must never fall back to some site's content.
 */
export function currentSite(): HostedSite | undefined {
  if (!registry) return undefined;
  const site = current.getStore();
  if (!site) throw new NoSiteError();
  return site;
}

/** A site as the registry gave it, checked before anything is opened for it. */
function checked(site: HostedSite): HostedSite {
  if (!ID.test(site.id)) throw new Error(`"${site.id}" cannot be a site's id. Use lower-case letters, digits and dashes.`);
  if (!URL.canParse(site.origin)) throw new Error(`The site "${site.id}" has no address the CMS can make links for.`);
  if (site.secret.length < 32) throw new Error(`The secret of the site "${site.id}" is shorter than 32 characters.`);
  return site;
}

/** The site at a host name, or `null`. On a server that runs one site there is nothing to find. */
export async function siteAt(host: string): Promise<HostedSite | null> {
  if (!registry) return null;
  const site = await registry.find(host.toLowerCase());
  return site ? checked(site) : null;
}

/** Runs work for one site: whatever it reads and writes is that site's and no other's. */
export const inSite = <Result>(site: HostedSite, work: () => Result): Result => current.run(checked(site), work);

/**
 * The tag every kept page of the site carries, which a publish clears. One site's publish never
 * clears another's pages.
 */
export const siteCacheTag = (): string => {
  const site = currentSite();
  return site ? `cms-site:${site.id}` : 'cms';
};

/** The key state kept per site in this server's memory is filed under. */
export const siteKey = (): string => currentSite()?.id ?? '';

/**
 * A response whose body is read inside the site's work. Astro draws a page as its response is
 * read, which happens after the middleware has returned: without this the rest of the page
 * would be drawn for no site.
 */
export function readInSite(site: HostedSite, response: Response): Response {
  if (!response.body) return response;
  const reader = response.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    pull: (controller) =>
      inSite(site, async () => {
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      }),
    cancel: (reason) => inSite(site, () => reader.cancel(reason)),
  });
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

/**
 * On a server that runs many sites, chooses the site a request is for before anything else runs.
 * A host name the registry does not know is answered as nothing at all: there is no site to
 * fall back to. On a server that runs one site this does nothing.
 *
 * The host name is the request's own, which is what a host that runs many sites routes by: it
 * says which site is asked for, never what that site's links are made for. Those come from the
 * registry (`HostedSite.origin`).
 */
export const hostedRequest: MiddlewareHandler = async (context, next) => {
  if (!isHosted() || context.isPrerendered) return next();
  const site = await siteAt(context.url.host);
  if (!site) return new Response('There is no site at this address.', { status: 404, headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' } });
  return inSite(site, async () => {
    // A page kept for this site is cleared by this site's publish and by no other's.
    context.cache.set({ tags: [siteCacheTag()] });
    return readInSite(site, await next());
  });
};
