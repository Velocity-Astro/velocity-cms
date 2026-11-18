/** Every address in the editor, relative to where it is mounted. Screens never write one by hand. */
/** Stands where an entry's id would be, in the address of an entry that has not been saved yet. */
export const NEW_ENTRY = 'new';

/** The name the address of a group's fields carries each holding field's id under. */
export const WITHIN = 'in';

export const paths = {
  home: '/',
  signIn: '/sign-in',
  people: '/people',
  media: '/media',
  trash: '/trash',
  plugins: '/plugins',
  /** A screen a plugin added. */
  pluginScreen: (plugin: string, screen: string) => `/plugins/${encodeURIComponent(plugin)}/${encodeURIComponent(screen)}`,
  types: '/types',
  /** A content type's fields, or with `within` (field ids from the top down) the fields a group holds. */
  type: (typeKey: string, within: readonly string[] = []) =>
    `/types/${encodeURIComponent(typeKey)}${within.length > 0 ? `?${new URLSearchParams(within.map((id) => [WITHIN, id]))}` : ''}`,
  contentList: (typeKey: string) => `/content/${encodeURIComponent(typeKey)}`,
  entry: (typeKey: string, entryId: string) => `/content/${encodeURIComponent(typeKey)}/${encodeURIComponent(entryId)}`,
  newEntry: (typeKey: string) => `/content/${encodeURIComponent(typeKey)}/${NEW_ENTRY}`,
} as const;
