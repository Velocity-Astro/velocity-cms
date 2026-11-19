import type { APIRoute } from 'astro';
import { uploadedFile } from '@velocity-astro/cms-astro';

export const prerender = false;

/**
 * An image someone uploaded in the editor, or with `?w=` a smaller copy of it. It may be cached, and says so itself: a file never
 * changes once it is kept.
 */
export const GET: APIRoute = ({ params, url }) => uploadedFile(params.file ?? '', url.searchParams.get('w'));
