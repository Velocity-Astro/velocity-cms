import type { PublicForm } from '@velocity/cms-core';
import { sharedConnection } from './connection.js';
import { FORM_LOCALE_FIELD, FORM_PAGE_FIELD, FORM_TOKEN_FIELD, FORM_TRAP_FIELD, FormPosts, formToken, type NoticeMailer } from './form-post.js';
import type { DrawnPage } from './page-head.js';
import { mailerFromEnv } from './resend-mailer.js';
import { siteSecret } from './secret.js';
import { editorOrigin, type SiteEditorSettings } from './site-editor.js';

let posts: Promise<FormPosts> | undefined;

const takesNotices = (mailer: unknown): mailer is NoticeMailer =>
  typeof mailer === 'object' && mailer !== null && typeof (mailer as { sendSubmissionNotice?: unknown }).sendSubmissionNotice === 'function';

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
  if (!posts) {
    const made = sharedConnection({}).then(
      ({ cms }) =>
        new FormPosts({
          cms,
          origin: (request) => originOf(request, settings),
          siteName: settings.siteName,
          secret: siteSecret(),
          // The site's own mailer when it sends notices, then Resend from its settings, then nobody.
          mailer: takesNotices(settings.mailer) ? settings.mailer : mailerFromEnv(),
          onFault: (error) => console.error('[velocity-cms]', error instanceof Error ? error.message : error),
        }),
    );
    posts = made;
    made.catch(() => {
      if (posts === made) posts = undefined;
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
}

/** The address of the script that sends a form without leaving its page (`data-cms-form`). */
export const FORM_SCRIPT = '/cms-form.js';

/** Which form: its key, as a template names one, or its id, as a field of type `form` holds one. */
export type FormChoice = string | { readonly id: string };

/**
 * A form of the CMS for the page being drawn, or `null` when there is none open under that key
 * or id, so the template leaves it out. It never throws: a page is not lost over its form.
 */
export async function siteForm(page: DrawnPage, choice: FormChoice): Promise<SiteForm | null> {
  try {
    const { cms } = await sharedConnection({});
    const form = typeof choice === 'string' ? await cms.forms.forSite(choice) : await cms.forms.forSiteById(choice.id);
    if (!form) return null;
    const token = await formToken(siteSecret(), form.key);
    const locale = page.currentLocale;
    return {
      ...form,
      action: `/api/cms/submit/${encodeURIComponent(form.key)}`,
      hidden: {
        [FORM_PAGE_FIELD]: page.url.pathname,
        ...(locale !== undefined && { [FORM_LOCALE_FIELD]: locale }),
        ...(token !== undefined && { [FORM_TOKEN_FIELD]: token }),
      },
      trap: FORM_TRAP_FIELD,
    };
  } catch (error) {
    console.error('[velocity-cms] A form could not be read.', error instanceof Error ? error.message : error);
    return null;
  }
}
