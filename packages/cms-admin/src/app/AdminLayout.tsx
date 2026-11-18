import { AppShell, Button, Dialog, Form, Logo, Stack, Text, TextField, dismissToasts, toast, type AppShellNavItem } from '@velocity/cms-ui';
import { House, KeyRound, LogOut, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { useAddPasskey, useContentTypes, useSession, useSignOut } from '../client/queries.js';
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
  const [isAddingPasskey, setAddingPasskey] = useState(false);

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
          // Only owners manage people, so only they are shown the way there.
          ...(session.data.role === 'owner'
            ? [
                {
                  id: 'site',
                  label: messages.app.siteGroup,
                  items: [{ id: 'people', label: messages.app.people, href: paths.people, icon: Users, isCurrent: location.pathname === paths.people }],
                },
              ]
            : []),
        ]}
        account={{
          name: session.data.name,
          detail: session.data.email,
          label: messages.app.accountMenu,
          actions: [
            { id: 'passkey', label: messages.app.addPasskey, icon: KeyRound },
            { id: 'sign-out', label: messages.app.signOut, icon: LogOut },
          ],
          onAction: (id) => {
            if (id === 'passkey') return setAddingPasskey(true);
            isSigningOut.current = true;
            signOut.mutate(undefined, {
              onSuccess: () => {
                // Messages about the last person's work are not for the next.
                dismissToasts();
                void navigate(paths.signIn);
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
      {isAddingPasskey && <PasskeyDialog onClose={() => setAddingPasskey(false)} />}
    </>
  );
}

/** Asks what to call a new passkey, then lets the browser make it. */
function PasskeyDialog({ onClose }: { readonly onClose: () => void }) {
  const messages = useMessages();
  const add = useAddPasskey();
  const [name, setName] = useState<string>(messages.app.passkeyDefaultName);
  const [problem, setProblem] = useState<string | null>(null);

  const make = () => {
    setProblem(null);
    add.mutate(name.trim() === '' ? messages.app.passkeyDefaultName : name.trim(), {
      onSuccess: () => {
        toast({ title: messages.app.passkeyAdded, description: messages.app.passkeyAddedDescription, tone: 'success' });
        onClose();
      },
      // The browser's prompt was closed, or the device has no way to make one. The window stays
      // open so the person can try again.
      onError: (error) => setProblem(error instanceof Error ? error.message : String(error)),
    });
  };

  return (
    <Dialog
      isOpen
      onOpenChange={(isOpen) => !isOpen && onClose()}
      title={messages.app.passkeyTitle}
      closeLabel={messages.app.dismiss}
      footer={
        <>
          <Button variant="secondary" onPress={onClose}>
            {messages.editor.cancel}
          </Button>
          <Button isPending={add.isPending} onPress={make}>
            {messages.app.passkeyAdd}
          </Button>
        </>
      }
    >
      <Stack gap={4}>
        <Text tone="secondary">{messages.app.passkeyDescription}</Text>
        <Form label={messages.app.passkeyTitle} onSubmit={make}>
          <TextField
            label={messages.app.passkeyName}
            description={messages.app.passkeyNameHelp}
            value={name}
            onChange={setName}
            autoFocus
            {...(problem !== null && { errorMessage: `${messages.app.passkeyNotAdded}. ${problem}` })}
          />
        </Form>
      </Stack>
    </Dialog>
  );
}
