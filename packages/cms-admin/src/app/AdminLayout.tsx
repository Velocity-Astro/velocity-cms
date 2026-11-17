import { AppShell, Logo, Toast, dismissToasts, type AppShellNavItem } from '@velocity/cms-ui';
import { House, LogOut } from 'lucide-react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { useContentTypes, useSession, useSignOut } from '../client/queries.js';
import { localized } from '../lib/content.js';
import { typeIcon } from '../lib/type-icon.js';
import { useLocale, useMessages } from '../messages/messages-context.js';
import { paths } from './paths.js';
import { ErrorState, LoadingState } from './RequestState.js';

export interface AdminLayoutProps {
  /** The site's name, shown at the top of the sidebar. */
  readonly siteName: string;
}

/** The frame around every signed-in screen. Sends anyone who is not signed in to the sign-in screen. */
export function AdminLayout({ siteName }: AdminLayoutProps) {
  const messages = useMessages();
  const locale = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const session = useSession();
  const types = useContentTypes();
  const signOut = useSignOut();

  if (session.isPending) return <LoadingState />;
  if (session.isError) return <ErrorState error={session.error} onRetry={() => void session.refetch()} />;
  if (session.data === null) return <Navigate to={paths.signIn} replace />;

  const nav: AppShellNavItem[] = (types.data ?? []).map((type) => {
    const href = paths.contentList(type.key);
    return {
      id: type.id,
      label: localized(type.label, locale),
      href,
      icon: typeIcon(type.key),
      isCurrent: location.pathname === href || location.pathname.startsWith(`${href}/`),
    };
  });

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
        ]}
        account={{
          name: session.data.name,
          detail: session.data.email,
          label: messages.app.accountMenu,
          actions: [{ id: 'sign-out', label: messages.app.signOut, icon: LogOut }],
          onAction: () =>
            signOut.mutate(undefined, {
              onSuccess: () => {
                // Messages about the last person's work are not for the next.
                dismissToasts();
                void navigate(paths.signIn);
              },
            }),
        }}
      >
        <Outlet />
      </AppShell>
      <Toast label={messages.app.notifications} closeLabel={messages.app.dismiss} />
    </>
  );
}
