/**
 * Every word the editor shows, in English. Screens contain no words of their own: they read
 * them from here, so the editor can be translated by adding a file like this one.
 *
 * A message that includes a value is a function, so each language can put it where it belongs.
 */
export const en = {
  app: {
    skipToContent: 'Skip to content',
    mainNavigation: 'Main',
    notifications: 'Notifications',
    dismiss: 'Dismiss',
    loading: 'Loading',
    signedInAs: (name: string) => `Signed in as ${name}`,
    accountMenu: 'Account',
    signOut: 'Sign out',
    somethingWentWrong: 'Something went wrong',
    tryAgain: 'Try again',
  },
  signIn: {
    title: 'Sign in',
    description: 'Use a passkey, or get a sign-in link by email. There is no password to remember.',
    email: 'Email',
    emailMissing: 'Enter your email address.',
    emailInvalid: 'Enter an email address, such as name@example.com.',
    sendLink: 'Email me a sign-in link',
    usePasskey: 'Sign in with a passkey',
    linkSentTitle: 'Check your email',
    linkSent: (email: string) =>
      `If ${email} belongs to someone on this site, a sign-in link is on its way. It works once and expires in 10 minutes.`,
    useAnotherEmail: 'Use a different email',
    passkeyFailed: 'The passkey did not work. Try again, or use a sign-in link instead.',
  },
  contentList: {
    description: (count: number) => (count === 1 ? '1 entry' : `${count} entries`),
    columnTitle: 'Title',
    columnStatus: 'Status',
    columnUpdated: 'Updated',
    untitled: 'Untitled',
    emptyTitle: (type: string) => `No ${type.toLowerCase()} yet`,
    emptyDescription: 'Entries appear on the site as soon as they are published.',
    noTypesTitle: 'No content types yet',
    noTypesDescription: 'A content type describes one kind of content, such as listings or blog posts.',
    typeNotFoundTitle: 'This content type does not exist',
    typeNotFoundDescription: 'It may have been renamed or removed.',
  },
  status: {
    draft: 'Draft',
    scheduled: 'Scheduled',
    published: 'Published',
    unpublishedChanges: 'Unpublished changes',
  },
} as const;

/** The shape every language file has. */
export type Messages = typeof en;
