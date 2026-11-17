import { AppShell, Menu, Button, Text, Toast, dismissToasts, type AppShellNavItem } from '@velocity/cms-ui';
import { FileText, LogOut } from 'lucide-react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { useContentTypes, useSession, useSignOut } from '../client/queries.js';
import { localized } from '../lib/content.js';
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
      icon: FileText,
      isCurrent: location.pathname === href || location.pathname.startsWith(`${href}/`),
    };
  });

  return (
    <>
      <AppShell
        brand={<Text weight="semibold">{siteName}</Text>}
        navLabel={messages.app.mainNavigation}
        skipLabel={messages.app.skipToContent}
        nav={nav}
        footer={
          <Menu
            trigger={
              <Button variant="ghost" size="sm" fullWidth>
                {messages.app.signedInAs(session.data.name)}
              </Button>
            }
            placement="top start"
            actions={[{ id: 'sign-out', label: messages.app.signOut, icon: LogOut }]}
            onAction={() =>
              signOut.mutate(undefined, {
                onSuccess: () => {
                  // Messages about the last person's work are not for the next.
                  dismissToasts();
                  void navigate(paths.signIn);
                },
              })
            }
          />
        }
      >
        <Outlet />
      </AppShell>
      <Toast label={messages.app.notifications} closeLabel={messages.app.dismiss} />
    </>
  );
}
