/** Every address in the editor, relative to where it is mounted. Screens never write one by hand. */
/** Stands where an entry's id would be, in the address of an entry that has not been saved yet. */
export const NEW_ENTRY = 'new';

/** The name the address of a group's fields carries each holding field's id under. */
export const WITHIN = 'in';

/** The parts of the site's settings, in the order of their tabs. */
export const SETTINGS_AREAS = ['general', 'email', 'storage', 'forms', 'tokens'] as const;
export type SettingsAreaId = (typeof SETTINGS_AREAS)[number];

export const paths = {
  home: '/',
  signIn: '/sign-in',
  people: '/people',
  media: '/media',
  trash: '/trash',
  forms: '/forms',
  /** One form: what it was sent, and its fields. */
  form: (formId: string) => `/forms/${encodeURIComponent(formId)}`,
  contacts: '/contacts',
  /** One contact: who they are and what happened with them. */
  contact: (contactId: string) => `/contacts/${encodeURIComponent(contactId)}`,
  deals: '/deals',
  plugins: '/plugins',
  /** A screen a plugin added. */
  pluginScreen: (plugin: string, screen: string) => `/plugins/${encodeURIComponent(plugin)}/${encodeURIComponent(screen)}`,
  /** The site's settings, at one of their parts. */
  settings: (area: SettingsAreaId = SETTINGS_AREAS[0]) => `/settings/${area}`,
  /** A single page that is part of the settings, shown as one of their parts. */
  settingsPage: (typeKey: string) => `/settings/page/${encodeURIComponent(typeKey)}`,
  types: '/types',
  /** A content type's fields, or with `within` (field ids from the top down) the fields a group holds. */
  type: (typeKey: string, within: readonly string[] = []) =>
    `/types/${encodeURIComponent(typeKey)}${within.length > 0 ? `?${new URLSearchParams(within.map((id) => [WITHIN, id]))}` : ''}`,
  contentList: (typeKey: string) => `/content/${encodeURIComponent(typeKey)}`,
  entry: (typeKey: string, entryId: string) => `/content/${encodeURIComponent(typeKey)}/${encodeURIComponent(entryId)}`,
  /** An entry with its page given the whole window: the visual editor. */
  visualEntry: (typeKey: string, entryId: string) => `/content/${encodeURIComponent(typeKey)}/${encodeURIComponent(entryId)}?view=visual`,
  newEntry: (typeKey: string) => `/content/${encodeURIComponent(typeKey)}/${NEW_ENTRY}`,
} as const;
