import type { APIRoute } from 'astro';
import { uploadedFile } from '@velocity/cms-astro';

export const prerender = false;

/**
 * An image someone uploaded in the editor. It may be cached, and says so itself: a file never
 * changes once it is kept.
 */
export const GET: APIRoute = ({ params }) => uploadedFile(params.file ?? '');
