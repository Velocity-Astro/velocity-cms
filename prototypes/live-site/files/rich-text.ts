import { z } from 'astro/zod';

const escape = (text: string) => text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

/**
 * Text someone shaped in the editor, as the CMS hands it over: HTML made from what they wrote,
 * with every word escaped, and the words alone a paragraph at a time. The project's own JSON
 * files still hold plain paragraphs, which read the same way.
 */
export const richText = z.union([
  z.object({ html: z.string(), paragraphs: z.array(z.string()) }),
  z
    .array(z.string())
    .min(1)
    .transform((paragraphs) => ({ html: paragraphs.map((paragraph) => `<p>${escape(paragraph)}</p>`).join(''), paragraphs })),
]);
