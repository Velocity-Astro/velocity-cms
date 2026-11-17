/** Every address in the editor, relative to where it is mounted. Screens never write one by hand. */
export const paths = {
  home: '/',
  signIn: '/sign-in',
  contentList: (typeKey: string) => `/content/${encodeURIComponent(typeKey)}`,
} as const;
