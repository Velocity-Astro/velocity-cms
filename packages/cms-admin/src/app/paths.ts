/** Every address in the editor, relative to where it is mounted. Screens never write one by hand. */
/** Stands where an entry's id would be, in the address of an entry that has not been saved yet. */
export const NEW_ENTRY = 'new';

export const paths = {
  home: '/',
  signIn: '/sign-in',
  people: '/people',
  contentList: (typeKey: string) => `/content/${encodeURIComponent(typeKey)}`,
  entry: (typeKey: string, entryId: string) => `/content/${encodeURIComponent(typeKey)}/${encodeURIComponent(entryId)}`,
  newEntry: (typeKey: string) => `/content/${encodeURIComponent(typeKey)}/${NEW_ENTRY}`,
} as const;
