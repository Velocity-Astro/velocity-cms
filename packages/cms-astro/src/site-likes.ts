import { isLiveType } from '@velocity-astro/cms-core';
import { sharedConnection } from './connection.js';
import { MemoryRateLimiter } from './form-post.js';
import { currentSite, siteKey } from './hosted.js';
import { LIKES_PATH, LikePosts } from './like-post.js';
import { pageAt, type DrawnPage } from './page-head.js';
import { siteSecret } from './secret.js';
import { editorOrigin, type SiteEditorSettings } from './site-editor.js';

/** What a page with a like button or a share bar runs: `<script src={LIKES_SCRIPT} defer>`. */
export const LIKES_SCRIPT = '/cms-likes.js';

/** One taker of likes for each site this server runs. */
const takers = new Map<string, Promise<LikePosts>>();

/** The site's one taker of likes for the life of the server, made on first use. */
export function siteLikePosts(settings: Pick<SiteEditorSettings, 'site' | 'dev'>): Promise<LikePosts> {
  const key = siteKey();
  let posts = takers.get(key);
  if (!posts) {
    const made = sharedConnection({}).then(
      ({ cms }) =>
        new LikePosts({
          cms,
          origin: (request) => {
            try {
              return editorOrigin(request, settings);
            } catch {
              // A site that has not said its address yet is taken at the request's word.
              return new URL(request.url).origin;
            }
          },
          secret: siteSecret(),
          limiter: new MemoryRateLimiter(60),
          readLimiter: new MemoryRateLimiter(600),
          onFault: (error) => console.error('[velocity-cms] A like could not be counted.', error instanceof Error ? error.message : error),
        }),
    );
    posts = made;
    takers.set(key, made);
    made.catch(() => {
      if (takers.get(key) === made) takers.delete(key);
    });
  }
  return posts;
}

/** What a like button needs to know, as a page draws it. */
export interface SiteLikes {
  /** The type's key: write it as `data-cms-like-type`. */
  readonly type: string;
  /** The entry's translation group, one for all its languages: write it as `data-cms-like-entry`. */
  readonly entry: string;
  /** Whether the page may show how many people liked it. When it may not, leave the count out. */
  readonly showCount: boolean;
  /** Where the button's script asks and sends. */
  readonly endpoint: string;
  /** The script that makes the button work. */
  readonly script: string;
}

/**
 * The like button of the page being drawn: the entry whose own page this is, when its type takes
 * likes (set in the type's settings in the editor), or `null`. A button for another entry names
 * it by its type and the live loader's id: `siteLikes(Astro, { type: 'posts', entry: entry.id })`.
 * It never throws: a page is not lost over its like button.
 *
 * ```astro
 * const likes = await siteLikes(Astro);
 * {likes && (
 *   <button type="button" data-cms-like data-cms-like-type={likes.type} data-cms-like-entry={likes.entry} aria-pressed="false">
 *     Like {likes.showCount && <span data-cms-like-count hidden></span>}
 *   </button>
 * )}
 * <script src={LIKES_SCRIPT} defer></script>
 * ```
 */
export async function siteLikes(page: DrawnPage, named?: { readonly type: string; readonly entry: string }): Promise<SiteLikes | null> {
  try {
    const { cms } = await sharedConnection({});
    const types = await cms.schema.list();
    if (named) {
      const type = types.find((candidate) => candidate.key === named.type && isLiveType(candidate));
      if (!type?.likes) return null;
      return { type: type.key, entry: named.entry, showCount: type.likes.showCount, endpoint: LIKES_PATH, script: LIKES_SCRIPT };
    }
    const { type, entry } = await pageAt(cms, types.filter((candidate) => isLiveType(candidate)), page.url.pathname);
    if (!type?.likes || !entry) return null;
    return { type: type.key, entry: entry.translationGroup, showCount: type.likes.showCount, endpoint: LIKES_PATH, script: LIKES_SCRIPT };
  } catch {
    return null;
  }
}

/**
 * Whether a type's entries take likes and show their count, for a page that lists them (a blog):
 * each card then carries a count the page's script fills in, named by the live loader's id.
 * `null` when the type takes no likes. It never throws.
 *
 * ```astro
 * const likes = await typeLikes('posts');
 * {likes?.showCount && <span data-cms-like-type="posts" data-cms-like-entry={entry.id} data-cms-like-count hidden></span>}
 * ```
 */
export async function typeLikes(typeKey: string): Promise<Omit<SiteLikes, 'entry'> | null> {
  try {
    const { cms } = await sharedConnection({});
    const type = (await cms.schema.list()).find((candidate) => candidate.key === typeKey && isLiveType(candidate));
    return type?.likes ? { type: type.key, showCount: type.likes.showCount, endpoint: LIKES_PATH, script: LIKES_SCRIPT } : null;
  } catch {
    return null;
  }
}

/** Where a page is shared to, each a plain link that opens in a new tab. */
export interface ShareLinks {
  /** The page's own address, for a "Copy link" button: `data-cms-share="copy" data-cms-share-url={links.url}`. */
  readonly url: string;
  readonly x: string;
  readonly linkedin: string;
  readonly facebook: string;
  readonly email: string;
}

/**
 * The links that share the page being drawn: on X, LinkedIn and Facebook, and by email. The
 * address is the page's own on the configured site, without its query. A button that says
 * `data-cms-share="native"` opens the phone's own share sheet where there is one (the script
 * shows it only there), and `data-cms-share="copy"` copies the address.
 */
export function shareLinks(page: DrawnPage & { readonly site?: URL | undefined }, title: string): ShareLinks {
  const base = currentSite()?.origin ?? (process.env.VELOCITY_CMS_ORIGIN || undefined) ?? page.site?.href ?? page.url.origin;
  const url = new URL(page.url.pathname, base).href;
  const to = encodeURIComponent(url);
  const words = encodeURIComponent(title);
  return {
    url,
    x: `https://x.com/intent/post?url=${to}&text=${words}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${to}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${to}`,
    email: `mailto:?subject=${words}&body=${to}`,
  };
}
