import { fileURLToPath } from 'node:url';

/**
 * Where the built editor is on disk, for the server that sends it. Written as a `new URL` beside
 * `import.meta.url` on purpose: hosts that bundle a site follow that pattern to find the files a
 * package needs, and would leave the editor behind if the path were worked out any other way.
 */
export const appDirectory = fileURLToPath(new URL('./app-dist', import.meta.url));
