import { IMAGE_WIDTHS, publicRichText, richTextNeeds, type Cms, type PublicRichText, type ResolvedImage, type RichText, type SiteImage } from '@velocity-astro/cms-core';
import { SITE } from './connection.js';
import { linkResolver } from './link.js';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Formatted text as the field type hands it to the site, before its links and pictures are found. */
const isPublicRichText = (value: unknown): value is PublicRichText =>
  isRecord(value) && typeof value['html'] === 'string' && Array.isArray(value['parts']) && isRecord(value['doc']) && value['doc']['type'] === 'doc';

const DEPTH = 12;

/** Every formatted text inside a value, however deep (a section, a column of a section, a list). */
function texts(value: unknown, into: RichText[], depth = 0): RichText[] {
  if (depth > DEPTH || !isRecord(value)) return into;
  if (isPublicRichText(value)) {
    into.push(value.doc);
    return into;
  }
  for (const inner of Array.isArray(value) ? value : Object.values(value)) texts(inner, into, depth + 1);
  return into;
}

function redrawn(value: unknown, draw: (text: RichText) => PublicRichText, depth = 0): unknown {
  if (depth > DEPTH || !isRecord(value)) return value;
  if (isPublicRichText(value)) return draw(value.doc);
  if (Array.isArray(value)) return value.map((inner) => redrawn(inner, draw, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, redrawn(inner, draw, depth + 1)]));
}

/** A picture of the site as a page loads it, with its smaller copies where the site makes them. */
export function resolvedImage(image: SiteImage): ResolvedImage {
  const copies =
    image.uploadedAt !== undefined && image.thumbnail !== undefined && image.width !== undefined
      ? IMAGE_WIDTHS.filter((width) => width < (image.width ?? 0)).map((width) => `${image.url}?w=${width} ${width}w`)
      : [];
  return {
    src: image.url,
    ...(image.width !== undefined && { width: image.width }),
    ...(image.height !== undefined && { height: image.height }),
    ...(copies.length > 0 && { srcset: [...copies, `${image.url} ${image.width}w`].join(', ') }),
  };
}

/**
 * The value with every formatted text in it drawn for a page in one language: a link to an entry
 * leads where the entry is today (and is left out, keeping its words, when the entry is not
 * published), and a picture is the image of the site's library it names. Text with neither is
 * left as it is, so most pages ask nothing more of the database.
 */
export async function withRichText<T>(cms: Cms, value: T, locale: string, preview = false): Promise<T> {
  const found = texts(value, []);
  const needs = found.map(richTextNeeds);
  const entries = needs.flatMap((need) => need.entries);
  const pictures = needs.flatMap((need) => need.images);
  if (entries.length === 0 && pictures.length === 0) return value;
  const resolve = linkResolver(cms, locale, preview);
  const leads = new Map<string, string>();
  await Promise.all(
    entries.map(async ({ type, entry }) => {
      const target = await resolve({ kind: 'entry', type, entry });
      if (target) leads.set(`${type}/${entry}`, target.href);
    }),
  );
  const library = pictures.length === 0 ? new Map<string, SiteImage>() : new Map((await cms.media.images(SITE)).map((image) => [image.name, image]));
  return redrawn(value, (text) =>
    publicRichText(text, {
      entryHref: (type, entry) => leads.get(`${type}/${entry}`),
      image: (name) => {
        const image = library.get(name);
        return image && resolvedImage(image);
      },
    }),
  ) as T;
}

/**
 * Lets the page show the videos, maps and players of the formatted text it draws, by adding
 * where each comes from to its content security policy (`frame-src`). Call it in the component
 * that writes the text:
 *
 * ```astro
 * allowEmbeds(Astro, post.data.body);
 * ```
 */
export function allowEmbeds(page: { readonly csp?: { insertDirective?: (directive: string) => void } | undefined }, ...values: readonly unknown[]): void {
  const frames = new Set(values.flatMap((value) => (isPublicRichText(value) ? value.frames : [])));
  if (frames.size === 0) return;
  try {
    page.csp?.insertDirective?.(`frame-src ${[...frames].join(' ')}`);
  } catch {
    // A site whose policy is not Astro's adds the addresses itself.
  }
}
