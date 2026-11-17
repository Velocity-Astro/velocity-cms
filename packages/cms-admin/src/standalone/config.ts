/**
 * What the server tells the editor about the site it is running on. The server writes it into
 * the page as JSON (see `EDITOR_CONFIG_ID`), so the same built files serve every site.
 */
export interface EditorConfig {
  /** Shown in the sidebar and on the sign-in screen. */
  readonly siteName: string;
  /** Where the editor is mounted: `/admin`. */
  readonly adminPath: string;
  /** Where the API is mounted: `/api/cms`. */
  readonly apiPath: string;
  /** Where sign-in is mounted: `/api/cms/auth`. */
  readonly authPath: string;
}

/** The id of the element that holds the config. */
export const EDITOR_CONFIG_ID = 'velocity-cms-config';

const KEYS = ['siteName', 'adminPath', 'apiPath', 'authPath'] as const satisfies readonly (keyof EditorConfig)[];

/** Reads the config from its JSON, and says what is wrong when the page was not served by the CMS. */
export function parseEditorConfig(json: string | null | undefined): EditorConfig {
  let value: unknown;
  try {
    value = JSON.parse(json ?? '');
  } catch {
    value = null;
  }
  const config = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const missing = KEYS.filter((key) => typeof config[key] !== 'string' || config[key] === '');
  if (missing.length > 0) {
    throw new Error(
      `The editor was opened without its settings (${missing.join(', ')}). It must be served by the Velocity CMS integration, not opened as a file.`,
    );
  }
  return Object.fromEntries(KEYS.map((key) => [key, config[key]])) as unknown as EditorConfig;
}
