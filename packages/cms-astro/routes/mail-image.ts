import type { APIRoute } from 'astro';
import { mailImage } from '@velocity-astro/cms-astro';
import { editor, ownOrigin } from './editor.ts';

export const prerender = false;

/** The site's logo as its emails load it: a PNG, made from the image its settings name. */
export const GET: APIRoute = ({ params, request }) => editor(request, () => mailImage(params.file ?? '', ownOrigin(request)));
