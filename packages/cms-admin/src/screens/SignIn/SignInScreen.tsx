import { AuthShell, Button, Form, Inline, Logo, Stack, Text, TextField, toast } from '@velocity-astro/cms-ui';
import { KeyRound } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { useGo } from '../../app/use-go.js';
import { paths } from '../../app/paths.js';
import { useRequestSignInLink, useSession, useSignInWithPasskey } from '../../client/queries.js';
import { useMessages } from '../../messages/messages-context.js';

export interface SignInScreenProps {
  readonly siteName: string;
}

/** An address with something before and after an @, and a dot after it. The server decides the rest. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What the address carries when a sign-in link was expired or already used. */
const LINK_FAILED = 'link';

/** Sign in with a passkey, or ask for a sign-in link by email. */
export function SignInScreen({ siteName }: SignInScreenProps) {
  const messages = useMessages();
  const go = useGo();
  const session = useSession();
  const sendLink = useRequestSignInLink();
  const passkey = useSignInWithPasskey();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string>();
  // A sign-in link that no longer works sends the person back here, saying so in the address.
  const [search] = useSearchParams();
  const linkFailed = search.has(LINK_FAILED) || search.has('error');

  if (session.data) return <Navigate to={paths.home} replace />;

  const brand = (
    <Inline gap={2} align="center">
      <Logo label={messages.app.product} />
      <Text weight="semibold">{siteName}</Text>
    </Inline>
  );

  if (sendLink.isSuccess) {
    return (
      <AuthShell brand={brand} title={messages.signIn.linkSentTitle} description={messages.signIn.linkSent(sendLink.variables)}>
        <Button variant="secondary" fullWidth onPress={() => sendLink.reset()}>
          {messages.signIn.useAnotherEmail}
        </Button>
      </AuthShell>
    );
  }

  const submit = () => {
    const address = email.trim();
    if (address === '') return setEmailError(messages.signIn.emailMissing);
    if (!LOOKS_LIKE_EMAIL.test(address)) return setEmailError(messages.signIn.emailInvalid);
    setEmailError(undefined);
    sendLink.mutate(address);
  };

  const failure =
    sendLink.error?.message ?? (passkey.isError ? messages.signIn.passkeyFailed : linkFailed ? messages.signIn.linkFailed : undefined);

  return (
    <AuthShell brand={brand} title={messages.signIn.title} description={messages.signIn.description}>
      <Stack gap={3}>
        <Form onSubmit={submit} label={messages.signIn.title}>
          <TextField
            label={messages.signIn.email}
            type="email"
            name="email"
            autoComplete="email webauthn"
            value={email}
            onChange={(value) => {
              setEmail(value);
              setEmailError(undefined);
            }}
            {...(emailError !== undefined && { errorMessage: emailError })}
          />
          <Button type="submit" fullWidth isPending={sendLink.isPending}>
            {messages.signIn.sendLink}
          </Button>
        </Form>
        <Button
          variant="secondary"
          icon={KeyRound}
          fullWidth
          isPending={passkey.isPending}
          onPress={() =>
            passkey.mutate(undefined, {
              onSuccess: (user) => {
                go(paths.home);
                toast({ title: messages.signIn.signedIn(user.name), tone: 'success' });
              },
            })
          }
        >
          {messages.signIn.usePasskey}
        </Button>
        {failure !== undefined && (
          <Text tone="danger" size="sm">
            {failure}
          </Text>
        )}
      </Stack>
    </AuthShell>
  );
}
