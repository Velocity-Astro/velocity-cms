import { AppShell, Logo, dismissToasts, toast, type AppShellNavItem } from '@velocity-astro/cms-ui';
import { Blocks, Contact, HandCoins, House, Images, Inbox, KeyRound, LogOut, Puzzle, Settings, Shapes, Trash2, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useGo } from './use-go.js';
import { useContentTypes, useSession, useSignOut } from '../client/queries.js';
import { localized } from '../lib/content.js';
import { typeIcon } from '../lib/type-icon.js';
import { useLocale, useMessages } from '../messages/messages-context.js';
import { useLoadPluginEditors, usePluginExtensions } from '../plugins/plugin-editor.js';
import { paths } from './paths.js';
import { ErrorState, LoadingState } from './RequestState.js';
import { PasskeysDialog } from './PasskeysDialog.js';

export interface AdminLayoutProps {
  /** The site's name, shown at the top of the sidebar. */
  readonly siteName: string;
}

/** The frame around every signed-in screen. Sends anyone who is not signed in to the sign-in screen. */
export function AdminLayout({ siteName }: AdminLayoutProps) {
  const messages = useMessages();
  const locale = useLocale();
  const location = useLocation();
  const go = useGo();
  const session = useSession();
  const types = useContentTypes();
  const signOut = useSignOut();
  const [isShowingPasskeys, setShowingPasskeys] = useState(false);

  // Someone who was signed in and no longer is, without having asked: the session ran out, or
  // an owner took their access away. They are told why the sign-in screen is back.
  const wasSignedIn = useRef(false);
  const isSigningOut = useRef(false);
  const isSignedIn = session.data !== null && session.data !== undefined;
  useEffect(() => {
    if (wasSignedIn.current && session.data === null && !isSigningOut.current) {
      toast({ title: messages.app.sessionEnded, description: messages.app.sessionEndedDescription });
    }
    wasSignedIn.current = isSignedIn;
  }, [isSignedIn, session.data, messages]);

  // What plugins add is fetched once someone is signed in, and the frame waits for it, so no
  // screen is drawn before a plugin's control for one of its fields is there.
  const hasPlugins = useLoadPluginEditors(isSignedIn);
  const { screens } = usePluginExtensions();

  if (session.isPending || (isSignedIn && !hasPlugins)) return <LoadingState shape="spinner" />;
  if (session.isError) return <ErrorState error={session.error} onRetry={() => void session.refetch()} />;
  if (session.data === null) return <Navigate to={paths.signIn} replace />;

  // A page that is part of the settings is reached from there, so the menu has one way to it.
  const settingsPages = (types.data ?? []).filter((type) => type.inSettings === true);
  const nav: AppShellNavItem[] = (types.data ?? []).filter((type) => type.inSettings !== true).map((type) => {
    const href = paths.contentList(type.key);
    return {
      id: type.id,
      label: localized(type.label, locale),
      href,
      icon: typeIcon(type.key),
      isCurrent: location.pathname === href || location.pathname.startsWith(`${href}/`),
    };
  });

  const pluginNav: AppShellNavItem[] = [
    ...screens.map((screen) => {
      const href = paths.pluginScreen(screen.plugin, screen.id);
      return { id: `plugin:${screen.plugin}:${screen.id}`, label: screen.label, href, icon: Blocks, isCurrent: location.pathname === href };
    }),
    ...(session.data.role === 'owner'
      ? [{ id: 'plugins', label: messages.app.plugins, href: paths.plugins, icon: Puzzle, isCurrent: location.pathname === paths.plugins }]
      : []),
  ];

  return (
    <>
      <AppShell
        logo={<Logo label={messages.app.product} />}
        siteName={siteName}
        navLabel={messages.app.mainNavigation}
        skipLabel={messages.app.skipToContent}
        nav={[
          { id: 'top', items: [{ id: 'home', label: messages.app.home, href: paths.home, icon: House, isCurrent: location.pathname === paths.home }] },
          { id: 'content', label: messages.app.contentGroup, items: nav },
          {
            id: 'site',
            label: messages.app.siteGroup,
            items: [
              { id: 'media', label: messages.app.media, href: paths.media, icon: Images, isCurrent: location.pathname === paths.media },
              // What visitors send is read by owners and editors, so they are shown the way to it.
              ...(session.data.role === 'owner' || session.data.role === 'editor'
                ? [
                    { id: 'forms', label: messages.app.forms, href: paths.forms, icon: Inbox, isCurrent: location.pathname === paths.forms || location.pathname.startsWith(`${paths.forms}/`) },
                    { id: 'contacts', label: messages.app.contacts, href: paths.contacts, icon: Contact, isCurrent: location.pathname === paths.contacts || location.pathname.startsWith(`${paths.contacts}/`) },
                    { id: 'deals', label: messages.app.deals, href: paths.deals, icon: HandCoins, isCurrent: location.pathname === paths.deals },
                  ]
                : []),
              // Only owners manage people and content types, so only they are shown the way there.
              ...(session.data.role === 'owner'
                ? [
                    {
                      id: 'types',
                      label: messages.app.types,
                      href: paths.types,
                      icon: Shapes,
                      isCurrent: location.pathname === paths.types || location.pathname.startsWith(`${paths.types}/`),
                    },
                    { id: 'people', label: messages.app.people, href: paths.people, icon: Users, isCurrent: location.pathname === paths.people },
                  ]
                : []),
              // Owners set the site up. Everyone else comes here only for the pages a template keeps in the settings.
              ...(session.data.role === 'owner' || settingsPages.length > 0
                ? [{ id: 'settings', label: messages.app.settings, href: '/settings', icon: Settings, isCurrent: location.pathname.startsWith('/settings') }]
                : []),
              { id: 'trash', label: messages.app.trash, href: paths.trash, icon: Trash2, isCurrent: location.pathname === paths.trash },
            ],
          },
          // Plugins have a section of their own: the screens they added, for everyone (what each
          // may do there is the server's to say), then the way to manage them, for owners. With
          // neither, the section is left out.
          ...(pluginNav.length > 0 ? [{ id: 'plugins', label: messages.app.pluginsGroup, items: pluginNav }] : []),
        ]}
        account={{
          name: session.data.name,
          detail: session.data.email,
          label: messages.app.accountMenu,
          actions: [
            { id: 'passkey', label: messages.app.passkeys, icon: KeyRound },
            { id: 'sign-out', label: messages.app.signOut, icon: LogOut },
          ],
          onAction: (id) => {
            if (id === 'passkey') return setShowingPasskeys(true);
            isSigningOut.current = true;
            signOut.mutate(undefined, {
              onSuccess: () => {
                // Messages about the last person's work are not for the next.
                dismissToasts();
                go(paths.signIn);
                toast({ title: messages.app.signedOut });
              },
              onError: (error) => {
                isSigningOut.current = false;
                toast({ title: messages.app.notSignedOut, description: error instanceof Error ? error.message : String(error), tone: 'danger' });
              },
            });
          },
        }}
      >
        <Outlet />
      </AppShell>
      {isShowingPasskeys && <PasskeysDialog onClose={() => setShowingPasskeys(false)} />}
    </>
  );
}
