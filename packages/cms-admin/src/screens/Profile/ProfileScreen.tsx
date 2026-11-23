import { Avatar, Button, Card, FileButton, Form, Inline, PageBody, PageHeader, Stack, Text, TextField, toast } from '@velocity-astro/cms-ui';
import { KeyRound, Mail, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { PasskeysDialog } from '../../app/PasskeysDialog.js';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import type { Profile } from '../../client/admin-client.js';
import { AdminRequestError } from '../../client/errors.js';
import { useAskEmailChange, useConfirmEmailChange, useProfile, useSaveProfile } from '../../client/queries.js';
import { profilePhoto } from '../../lib/profile-photo.js';
import { useMessages } from '../../messages/messages-context.js';

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
/** What the server said about a field, by the field's key. */
const problemsOf = (error: unknown, field: string): Record<string, string> => {
  const issues = error instanceof AdminRequestError ? error.issues : [];
  return issues.length > 0 ? Object.fromEntries(issues.map((issue) => [String(issue.path[0] ?? field), issue.message])) : { [field]: messageOf(error) };
};

/** The signed-in person's own details: their photo and name, the address they sign in with, and their passkeys. */
export function ProfileScreen() {
  const messages = useMessages();
  const profile = useProfile();
  return (
    <PageBody width="narrow">
      <Stack gap={6}>
        <PageHeader title={messages.profile.title} description={messages.profile.description} />
        <EmailLink />
        {profile.isPending && <LoadingState shape="form" />}
        {profile.isError && <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />}
        {profile.isSuccess && (
          <>
            <Stack gap={6}>
              <DetailsCard profile={profile.data} />
              <EmailCard profile={profile.data} />
              <PasskeysCard />
            </Stack>
          </>
        )}
      </Stack>
    </PageBody>
  );
}

/** Opens the link sent to a new address: `?email=<token>`, used once and taken off the address. */
function EmailLink() {
  const messages = useMessages();
  const [params, setParams] = useSearchParams();
  const confirm = useConfirmEmailChange();
  const token = params.get('email');
  const used = useRef<string | null>(null);
  useEffect(() => {
    if (token === null || used.current === token) return;
    used.current = token;
    setParams({}, { replace: true });
    confirm.mutate(token, {
      onSuccess: (saved) => toast({ title: messages.profile.emailConfirmed, description: messages.profile.emailConfirmedDescription(saved.email), tone: 'success' }),
      onError: (error) => toast({ title: messages.profile.emailNotConfirmed, description: messageOf(error), tone: 'danger' }),
    });
  }, [token, confirm, setParams, messages]);
  return null;
}

function DetailsCard({ profile }: { readonly profile: Profile }) {
  const messages = useMessages();
  const words = messages.profile;
  const save = useSaveProfile();
  const photo = useSaveProfile();
  const [name, setName] = useState(profile.name);
  const [problems, setProblems] = useState<Record<string, string>>({});

  const send = () => {
    setProblems({});
    save.mutate(
      { name },
      {
        onSuccess: (saved) => {
          setName(saved.name);
          toast({ title: words.saved, tone: 'success' });
        },
        onError: (error) => {
          setProblems(problemsOf(error, 'name'));
          toast({ title: words.notSaved, description: messageOf(error), tone: 'danger' });
        },
      },
    );
  };

  const choose = async (file: File) => {
    const image = await profilePhoto(file);
    if (image === null) {
      toast({ title: words.photoNotSaved, description: words.photoUnreadable, tone: 'danger' });
      return;
    }
    photo.mutate(
      { image },
      {
        onSuccess: () => toast({ title: words.photoSaved, tone: 'success' }),
        onError: (error) => toast({ title: words.photoNotSaved, description: messageOf(error), tone: 'danger' }),
      },
    );
  };

  const removePhoto = () =>
    photo.mutate(
      { image: null },
      {
        onSuccess: () => toast({ title: words.photoRemoved, tone: 'success' }),
        onError: (error) => toast({ title: words.photoNotSaved, description: messageOf(error), tone: 'danger' }),
      },
    );

  return (
    <Card title={words.detailsTitle} actions={<Text tone="muted">{words.role(messages.people.roles[profile.role])}</Text>}>
      <Stack gap={6}>
        <Inline gap={4}>
          <Avatar name={profile.name} src={profile.image} size="lg" />
          <Stack gap={2}>
            <Text weight="semibold">{words.photo}</Text>
            <Inline gap={2}>
              <FileButton accept="image" icon={Upload} size="sm" isPending={photo.isPending} onSelect={(file) => void choose(file)}>
                {profile.image === undefined ? words.photoChoose : words.photoReplace}
              </FileButton>
              {profile.image !== undefined && (
                <Button variant="ghost" size="sm" icon={Trash2} isDisabled={photo.isPending} onPress={removePhoto}>
                  {words.photoRemove}
                </Button>
              )}
            </Inline>
            <Text size="sm" tone="muted">
              {words.photoHelp}
            </Text>
          </Stack>
        </Inline>
        <Form onSubmit={send}>
          <TextField
            label={words.name}
            value={name}
            onChange={setName}
            isRequired
            autoComplete="name"
            description={words.nameHelp}
            {...(problems['name'] !== undefined && { errorMessage: problems['name'] })}
          />
          <Inline gap={3}>
            <Button type="submit" isPending={save.isPending} isDisabled={name.trim() === profile.name}>
              {words.save}
            </Button>
          </Inline>
        </Form>
      </Stack>
    </Card>
  );
}

function EmailCard({ profile }: { readonly profile: Profile }) {
  const words = useMessages().profile;
  const ask = useAskEmailChange();
  const [isChanging, setChanging] = useState(false);
  const [email, setEmail] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const send = () => {
    setProblem(null);
    ask.mutate(email, {
      onSuccess: () => {
        toast({ title: words.emailSent, description: words.emailSentDescription(email.trim()), tone: 'success' });
        setChanging(false);
        setEmail('');
      },
      onError: (error) => {
        setProblem(problemsOf(error, 'email')['email'] ?? messageOf(error));
        toast({ title: words.emailNotSent, description: messageOf(error), tone: 'danger' });
      },
    });
  };

  return (
    <Card title={words.emailTitle} description={words.emailDescription}>
      <Stack gap={4}>
        <Text>{words.emailCurrent(profile.email)}</Text>
        {isChanging ? (
          <Form onSubmit={send}>
            <TextField
              label={words.emailNew}
              type="email"
              value={email}
              onChange={setEmail}
              isRequired
              autoFocus
              autoComplete="email"
              description={words.emailNewHelp}
              {...(problem !== null && { errorMessage: problem })}
            />
            <Inline gap={3}>
              <Button type="submit" icon={Mail} isPending={ask.isPending} isDisabled={email.trim() === ''}>
                {words.emailSend}
              </Button>
              <Button
                variant="ghost"
                onPress={() => {
                  setChanging(false);
                  setProblem(null);
                }}
              >
                {words.emailCancel}
              </Button>
            </Inline>
          </Form>
        ) : (
          <Inline gap={3}>
            <Button variant="secondary" icon={Mail} onPress={() => setChanging(true)}>
              {words.emailChange}
            </Button>
          </Inline>
        )}
      </Stack>
    </Card>
  );
}

function PasskeysCard() {
  const words = useMessages().profile;
  const [isOpen, setOpen] = useState(false);
  return (
    <Card title={words.passkeysTitle} description={words.passkeysDescription}>
      <Inline gap={3}>
        <Button variant="secondary" icon={KeyRound} onPress={() => setOpen(true)}>
          {words.passkeysManage}
        </Button>
      </Inline>
      {isOpen && <PasskeysDialog onClose={() => setOpen(false)} />}
    </Card>
  );
}
