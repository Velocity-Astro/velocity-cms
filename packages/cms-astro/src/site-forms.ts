import type { PublicForm } from '@velocity-astro/cms-core';
import { isLiveType } from '@velocity-astro/cms-core';
import { sharedConnection, SITE } from './connection.js';
import { FORM_ABOUT_FIELD, FORM_CHALLENGE_KEY_FIELD, FORM_LOCALE_FIELD, FORM_PAGE_FIELD, FORM_TOKEN_FIELD, FORM_TRAP_FIELD, FormPosts, MemoryRateLimiter, aboutMark, formToken } from './form-post.js';
import { pageAt, type DrawnPage } from './page-head.js';
import { currentSite, siteKey } from './hosted.js';
import { LogMailer } from './editor.js';
import { SiteMail } from './site-mail.js';
import { siteNameNow } from './site-name.js';
import { SiteChallenge, TURNSTILE_HOST, TURNSTILE_SCRIPT } from './challenge.js';
import { siteSecret } from './secret.js';
import { editorOrigin, type SiteEditorSettings } from './site-editor.js';

/** One taker of form posts for each site this server runs. */
const takers = new Map<string, Promise<FormPosts>>();

/** The site's address for forms. A site that has not said its address yet is taken at the request's word. */
function originOf(request: Request, settings: Pick<SiteEditorSettings, 'site' | 'dev'>): string {
  try {
    return editorOrigin(request, settings);
  } catch {
    return new URL(request.url).origin;
  }
}

/** The site's one taker of form posts for the life of the server, made on first use. */
export function siteFormPosts(settings: SiteEditorSettings): Promise<FormPosts> {
  const key = siteKey();
  let posts = takers.get(key);
  if (!posts) {
    const onFault = (error: unknown) => console.error('[velocity-cms]', error instanceof Error ? error.message : error);
    const made = sharedConnection({}).then(({ cms }) => {
      const challenge = new SiteChallenge({ account: () => cms.settings.challengeAccount(), onFault });
      const counted = new MemoryRateLimiter();
      return new FormPosts({
          cms,
          origin: (request) => originOf(request, settings),
          siteName: currentSite()?.name ?? settings.siteName,
          secret: siteSecret(),
          entryAt: async (path) => {
            const { type, entry } = await pageAt(cms, await cms.schema.list(), path);
            return type && entry ? { typeId: type.id, entry: entry.translationGroup } : undefined;
          },
          // The site's own mailer when it sends notices, then Resend from the server's settings, then what an owner set up in the editor.
          mailer: new SiteMail({ settings: cms.settings, own: settings.mailer, fallback: new LogMailer(), hosted: currentSite() !== undefined, ...(currentSite() === undefined && { siteName: () => siteNameNow(cms) }) }),
          challenge,
          // What an owner set under Settings, Forms and spam. Settings that cannot be read leave the limit the CMS comes with.
          limiter: { take: async (address) => counted.take(address, await cms.settings.formPostsPerAddress().catch(() => undefined)) },
          onFault,
        });
    });
    posts = made;
    takers.set(key, made);
    made.catch(() => {
      if (takers.get(key) === made) takers.delete(key);
    });
  }
  return posts;
}

/** A form as a page draws it, with where it posts and the hidden fields it sends along. */
export interface SiteForm extends PublicForm {
  /** Where the form posts: the `action` of its `<form method="post">`. */
  readonly action: string;
  /** Hidden fields to write into the form as they are: name and value. */
  readonly hidden: Readonly<Record<string, string>>;
  /**
   * The name of a field to draw empty and out of sight (and out of reach of the keyboard and of
   * screen readers). A person leaves it alone; a script that fills in everything gives itself away.
   */
  readonly trap: string;
  /**
   * The challenge a sender must pass, when an owner set one up. The form's script (`FORM_SCRIPT`)
   * draws it where the form has a `[data-cms-form-challenge]`, or above the submit button. A
   * site with a content security policy allows `host` for scripts and frames.
   */
  readonly challenge?: { readonly provider: 'turnstile'; readonly siteKey: string; readonly script: string; readonly host: string };
}

/** The address of the script that sends a form without leaving its page (`data-cms-form`). */
export const FORM_SCRIPT = '/cms-form.js';

/** Which form: its key, as a template names one, or its id, as a field of type `form` holds one. */
export type FormChoice = string | { readonly id: string };

/** What a page may say about the form it draws. */
export interface SiteFormOptions {
  /**
   * The published entry the form is about, when the page knows better than its address does: a
   * listing's page says the listing, so what is sent is kept as being about it, and starts a
   * deal about it when the form asks for that. `type` is the content type's key.
   */
  readonly about?: { readonly type: string; readonly slug: string; readonly locale?: string };
}

/**
 * A form of the CMS for the page being drawn, or `null` when there is none open under that key
 * or id, so the template leaves it out. It never throws: a page is not lost over its form.
 */
export async function siteForm(page: DrawnPage, choice: FormChoice, options: SiteFormOptions = {}): Promise<SiteForm | null> {
  try {
    const { cms } = await sharedConnection({});
    const form = typeof choice === 'string' ? await cms.forms.forSite(choice) : await cms.forms.forSiteById(choice.id);
    if (!form) return null;
    const token = await formToken(siteSecret(), form.key);
    const locale = page.currentLocale;
    const siteKey = await cms.settings.challengeSiteKey();
    let about: string | undefined;
    if (options.about) {
      // An entry that is not there, or not published, leaves the form as one about nothing.
      const type = await cms.schema.getByKey(options.about.type).catch(() => undefined);
      const entry = type && isLiveType(type) ? await cms.content.findBySlug(SITE, { typeId: type.id, locale: options.about.locale ?? locale ?? 'en', slug: options.about.slug, version: 'published' }) : null;
      if (type && entry) about = await aboutMark(siteSecret(), form.key, { typeId: type.id, entry: entry.translationGroup });
    }
    return {
      ...form,
      action: `/api/cms/submit/${encodeURIComponent(form.key)}`,
      hidden: {
        [FORM_PAGE_FIELD]: page.url.pathname,
        ...(locale !== undefined && { [FORM_LOCALE_FIELD]: locale }),
        ...(token !== undefined && { [FORM_TOKEN_FIELD]: token }),
        ...(about !== undefined && { [FORM_ABOUT_FIELD]: about }),
        ...(siteKey !== null && { [FORM_CHALLENGE_KEY_FIELD]: siteKey }),
      },
      trap: FORM_TRAP_FIELD,
      ...(siteKey !== null && { challenge: { provider: 'turnstile' as const, siteKey, script: TURNSTILE_SCRIPT, host: TURNSTILE_HOST } }),
    };
  } catch (error) {
    console.error('[velocity-cms] A form could not be read.', error instanceof Error ? error.message : error);
    return null;
  }
}
