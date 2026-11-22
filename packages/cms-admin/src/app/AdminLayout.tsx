import { AppShell, LoadingMark, dismissToasts, toast, type AppShellNavGroup, type AppShellNavItem, type CommandItem } from '@velocity-astro/cms-ui';
import { Blocks, Contact, HandCoins, House, Images, Inbox, KeyRound, Layers, LogOut, Plus, Puzzle, Settings, Shapes, Trash2, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useGo } from './use-go.js';
import { useContentTypes, useSession, useSignOut } from '../client/queries.js';
import { localized } from '../lib/content.js';
import { hasCommandKey, useCommandKey } from '../lib/use-command-key.js';
import { typeIcon } from '../lib/type-icon.js';
import { useLocale, useMessages } from '../messages/messages-context.js';
import { holdBoot } from '../lib/boot.js';
import { useLoadPluginEditors, usePluginExtensions } from '../plugins/plugin-editor.js';
import { paths } from './paths.js';
import { ErrorState } from './RequestState.js';
import { PasskeysDialog } from './PasskeysDialog.js';
import { SearchPalette } from './SearchPalette.js';

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
  const [isSearching, setSearching] = useState(false);
  useCommandKey(() => setSearching(true));

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

  // Until then the editor has no screen to draw: the mark, which keeps the page's own up over it.
  const isOpening = session.isPending || (isSignedIn && !hasPlugins);
  useEffect(() => (isOpening ? holdBoot() : undefined), [isOpening]);

  if (isOpening) return <LoadingMark label={messages.app.opening} />;
  if (session.isError) return <ErrorState error={session.error} onRetry={() => void session.refetch()} />;
  if (session.data === null) return <Navigate to={paths.signIn} replace />;

  const role = session.data.role;
  const at = (href: string) => location.pathname === href || location.pathname.startsWith(`${href}/`);
  // A page that is part of the settings is reached from there, so the menu has one way to it.
  const settingsPages = (types.data ?? []).filter((type) => type.inSettings === true);
  const contentTypes = (types.data ?? []).filter((type) => type.inSettings !== true);
  const typeNav: AppShellNavItem[] = contentTypes.map((type) => {
    const href = paths.contentList(type.key);
    return { id: type.id, label: localized(type.label, locale), href, icon: typeIcon(type.key), isCurrent: at(href) };
  });
  // Where content is looked after, beside the content itself: the types, for owners, and the trash.
  const workspaceNav: AppShellNavItem[] = [
    ...(role === 'owner' ? [{ id: 'types', label: messages.app.types, href: paths.types, icon: Shapes, isCurrent: at(paths.types) }] : []),
    { id: 'trash', label: messages.app.trash, href: paths.trash, icon: Trash2, isCurrent: at(paths.trash) },
  ];
  const contentChildren: AppShellNavGroup[] = [
    ...(typeNav.length > 0 ? [{ id: 'collections', label: messages.app.collectionsGroup, items: typeNav }] : []),
    { id: 'workspace', label: messages.app.workspaceGroup, items: workspaceNav },
  ];
  // Content leads to a list: a single page would open its entry, with no column to choose another from.
  const firstList = contentTypes.find((type) => type.kind !== 'single') ?? contentTypes[0];
  // An entry being edited has the width to itself: the column of places comes back with the list.
  const isInEntry = /^\/content\/[^/]+\/[^/]+/.test(location.pathname);
  const content: AppShellNavItem = {
    id: 'content',
    label: messages.app.contentGroup,
    href: firstList === undefined ? (workspaceNav[0]?.href ?? paths.trash) : paths.contentList(firstList.key),
    icon: Layers,
    isCurrent: location.pathname.startsWith('/content/') || at(paths.types) || at(paths.trash),
    ...(!isInEntry && { children: contentChildren }),
  };

  // Plugins have a section of their own: the screens they added, for everyone (what each may do
  // there is the server's to say), then the way to manage them, for owners. With neither, there is no section.
  const pluginNav: AppShellNavItem[] = [
    ...screens.map((screen) => {
      const href = paths.pluginScreen(screen.plugin, screen.id);
      return { id: `plugin:${screen.plugin}:${screen.id}`, label: screen.label, href, icon: Blocks, isCurrent: location.pathname === href };
    }),
    ...(role === 'owner' ? [{ id: 'plugins', label: messages.app.plugins, href: paths.plugins, icon: Puzzle, isCurrent: location.pathname === paths.plugins }] : []),
  ];
  const plugins: AppShellNavItem[] =
    pluginNav.length === 0
      ? []
      : [
          {
            id: 'plugins',
            label: messages.app.pluginsGroup,
            href: pluginNav[0]?.href ?? paths.plugins,
            icon: Puzzle,
            isCurrent: location.pathname.startsWith('/plugins'),
            ...(screens.length > 0 && { children: [{ id: 'plugins', items: pluginNav }] }),
          },
        ];

  const nav: AppShellNavGroup[] = [
    { id: 'top', items: [{ id: 'home', label: messages.app.home, href: paths.home, icon: House, isCurrent: location.pathname === paths.home }] },
    { id: 'site', label: messages.app.siteGroup, items: [content, { id: 'media', label: messages.app.media, href: paths.media, icon: Images, isCurrent: at(paths.media) }] },
    // What visitors send is read by owners and editors, so they are shown the way to it.
    ...(role === 'owner' || role === 'editor'
      ? [
          {
            id: 'audience',
            label: messages.app.audienceGroup,
            items: [
              { id: 'forms', label: messages.app.forms, href: paths.forms, icon: Inbox, isCurrent: at(paths.forms) },
              { id: 'contacts', label: messages.app.contacts, href: paths.contacts, icon: Contact, isCurrent: at(paths.contacts) },
              { id: 'deals', label: messages.app.deals, href: paths.deals, icon: HandCoins, isCurrent: at(paths.deals) },
            ],
          },
        ]
      : []),
    {
      id: 'admin',
      place: 'end',
      items: [
        // Only owners manage people.
        ...(role === 'owner' ? [{ id: 'people', label: messages.app.people, href: paths.people, icon: Users, isCurrent: at(paths.people) }] : []),
        ...plugins,
        // Owners set the site up. Everyone else comes here only for the pages a template keeps in the settings.
        ...(role === 'owner' || settingsPages.length > 0
          ? [{ id: 'settings', label: messages.app.settings, href: '/settings', icon: Settings, isCurrent: location.pathname.startsWith('/settings') }]
          : []),
      ],
    },
  ];

  // What can be made from anywhere: an entry of each type that has more than one.
  const creatable = contentTypes.filter((type) => type.kind !== 'single');
  // Everything the menu leads to, and everything that can be made, found by typing.
  const places: CommandItem[] = nav.flatMap((group) =>
    group.items.flatMap((item) => [
      ...(item.children === undefined ? [{ id: `go:${item.href}`, label: item.label, ...(item.icon && { icon: item.icon }) }] : []),
      ...(item.children ?? []).flatMap((child) =>
        child.items.map((place) => ({ id: `go:${place.href}`, label: place.label, detail: item.label, ...(place.icon && { icon: place.icon }) })),
      ),
    ]),
  );
  const creations: CommandItem[] = creatable.map((type) => ({ id: `new:${type.key}`, label: messages.app.createIn(localized(type.label, locale)), icon: Plus }));

  return (
    <>
      <AppShell
        logoLabel={messages.app.product}
        siteName={siteName}
        siteDetail={window.location.host}
        navLabel={messages.app.mainNavigation}
        menuLabel={messages.app.openMenu}
        skipLabel={messages.app.skipToContent}
        nav={nav}
        // Home opens on its own greeting and puts nothing in the bar, so it has none: the search is Ctrl or Command with K.
        isBarHidden={location.pathname === paths.home}
        search={{
          label: messages.app.search,
          shortcut: hasCommandKey() ? messages.app.searchShortcutCommand : messages.app.searchShortcutControl,
          onPress: () => setSearching(true),
        }}
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
      <SearchPalette
        isOpen={isSearching}
        onOpenChange={setSearching}
        places={places}
        creations={creations}
        types={types.data ?? []}
        findsContacts={role === 'owner' || role === 'editor'}
        onGo={go}
        onCreate={(typeKey) => go(paths.newEntry(typeKey))}
      />
      {isShowingPasskeys && <PasskeysDialog onClose={() => setShowingPasskeys(false)} />}
    </>
  );
}
