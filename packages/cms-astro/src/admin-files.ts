import fs from 'node:fs';
import path from 'node:path';
import { appDirectory } from '@velocity/cms-admin/app-directory';

/** What the editor needs to know about the site, written into its page. */
export interface EditorPageConfig {
  readonly siteName: string;
  readonly adminPath: string;
  readonly apiPath: string;
  readonly authPath: string;
}

interface StaticFile {
  readonly body: Buffer;
  readonly type: string;
}

const TYPES: Readonly<Record<string, string>> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
};

/** Where the editor's page marks the place for its settings. */
const MARKER = '<!--velocity-cms-->';

/**
 * The page may load scripts and styles only from the site itself, and may not be put in a frame.
 * Styles written on elements are allowed because the editor's floating panels place themselves
 * that way; nothing here can run a script.
 */
const PAGE_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'content-security-policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
};

/** Where `@velocity/cms-admin` keeps the editor it built. */
export const builtEditorDirectory = (): string => appDirectory;

/**
 * Serves the editor: a page and the files it loads, built ahead of time by `cms-admin`. The
 * files are read once. Only a file that was there at the start can ever be sent, whatever
 * address is asked for.
 */
export class AdminFiles {
  readonly #files = new Map<string, StaticFile>();
  readonly #page: string;
  readonly #adminPath: string;

  constructor(directory: string, config: EditorPageConfig) {
    const index = path.join(directory, 'index.html');
    if (!fs.existsSync(index)) {
      throw new Error(`The editor has not been built: ${index} is missing. Run \`pnpm --filter @velocity/cms-admin build:app\`.`);
    }
    for (const name of fs.readdirSync(directory, { recursive: true }).map(String)) {
      const file = path.join(directory, name);
      const type = TYPES[path.extname(name)];
      if (type && fs.statSync(file).isFile()) this.#files.set(name.replaceAll('\\', '/'), { body: fs.readFileSync(file), type });
    }
    this.#adminPath = config.adminPath;
    // `<` is escaped so nothing in a site's name can end the block and start a script.
    const settings = JSON.stringify(config).replaceAll('<', '\\u003c');
    this.#page = fs
      .readFileSync(index, 'utf8')
      .replace(MARKER, `<base href="${config.adminPath}/" />\n    <script type="application/json" id="velocity-cms-config">${settings}</script>`);
  }

  /** Answers a request for anything under the editor's address. */
  respond(request: Request): Response {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } });
    }
    const { pathname } = new URL(request.url);
    const inside = pathname === this.#adminPath ? '' : pathname.slice(this.#adminPath.length + 1);
    const file = this.#files.get(inside);
    if (file) {
      // File names carry a hash of their content, so a browser may keep them for good.
      return new Response(new Uint8Array(file.body), {
        headers: { 'content-type': file.type, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' },
      });
    }
    // A missing file must not be answered with the page: a browser would try to run it.
    if (inside.startsWith('assets/')) return new Response(null, { status: 404 });
    // Every other address is a screen of the editor, which works out which one in the browser.
    return new Response(this.#page, { headers: PAGE_HEADERS });
  }
}
