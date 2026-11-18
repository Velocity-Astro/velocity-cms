import { z } from 'zod';
import { FieldType } from '../field-type.js';
import { isSafeLink } from '../rich-text.js';

/** A link to one of the site's own entries. It follows the entry when its address changes. */
export interface EntryLink {
  readonly kind: 'entry';
  /** The key of the entry's content type, e.g. `pages`. */
  readonly type: string;
  /** The entry's translation group, which every language of it shares and which never changes. */
  readonly entry: string;
}

/** A link to an address that is typed in: a page of the site that is not an entry, or anywhere else. */
export interface AddressLink {
  readonly kind: 'address';
  readonly href: string;
}

export type LinkValue = EntryLink | AddressLink;

const ADDRESS_HELP = 'Give a path on this site that starts with "/", such as /about, or a full address that starts with https://, mailto: or tel:. Leave no spaces in it.';

/**
 * A link: to one of the site's entries, or to an address that is typed in. It is what a menu is
 * made of, and what a button on a page points at.
 *
 * A link to an entry stores which entry, not its address, so renaming the entry never breaks the
 * link. The site turns it into an address when it draws the page, and leaves out a link whose
 * entry is not published.
 */
export class LinkField extends FieldType<LinkValue, { to?: string[] | undefined }> {
  readonly type = 'link';
  readonly editor = 'link';
  readonly options = z.object({
    /** The keys of the content types whose entries can be linked to. Left out, every type with a page of its own. */
    to: z.array(z.string().min(1)).min(1).optional(),
  });

  schema({ to }: { to?: string[] | undefined }) {
    return z.discriminatedUnion('kind', [
      z.strictObject({
        kind: z.literal('entry'),
        type: z.string().min(1).refine((type) => to === undefined || to.includes(type), { message: 'This field cannot link to that kind of entry. Choose another.' }),
        entry: z.string().min(1),
      }),
      z.strictObject({
        kind: z.literal('address'),
        href: z.string().max(2000).refine(isSafeLink, { message: ADDRESS_HELP }),
      }),
    ]);
  }
}
