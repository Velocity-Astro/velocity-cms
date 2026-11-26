import { fileURLToPath } from 'node:url';

/**
 * Where the migrations are on disk. Written as a `new URL` beside `import.meta.url` at the top of
 * a module on purpose: hosts that trace the files a site needs (Vercel) follow that pattern, and
 * leave the folder behind when the path is worked out inside a function. It has a module of its
 * own, loaded only where there is a disk, because a Worker has no `import.meta.url` to read.
 */
export const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url));
