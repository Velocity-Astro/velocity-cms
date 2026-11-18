import type { FormDef } from '@velocity-astro/cms-core';
import { Box, Button, ConfirmDialog, EmptyState, Inline, Link, PageHeader, Stack, Tabs, Text, toast } from '@velocity-astro/cms-ui';
import { Inbox, Settings2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { paths } from '../../app/paths.js';
import { useGo } from '../../app/use-go.js';
import { useForms, useSession, useTrashForm } from '../../client/queries.js';
import { localized } from '../../lib/content.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';
import { FormFields } from './FormFields.js';
import { FormSettingsDialog } from './FormSettingsDialog.js';
import { Submissions } from './Submissions.js';

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** One form: what visitors sent through it, its fields, and its settings. */
export function FormScreen() {
  const { formId = '' } = useParams();
  const messages = useMessages();
  const forms = useForms();

  if (forms.isPending) return <LoadingState />;
  if (forms.isError) return <ErrorState error={forms.error} onRetry={() => void forms.refetch()} />;
  const form = forms.data.find((candidate) => candidate.id === formId);
  if (!form) {
    return (
      <EmptyState icon={Inbox} title={messages.forms.notFoundTitle} description={messages.forms.notFoundDescription} action={<Link href={paths.forms}>{messages.forms.backToForms}</Link>} />
    );
  }
  // Made anew for each form, so nothing chosen in one is left open in another.
  return <FormParts key={form.id} form={form} />;
}

function FormParts({ form }: { readonly form: FormDef }) {
  const messages = useMessages();
  const locale = useLocale();
  const go = useGo();
  const session = useSession();
  const trash = useTrashForm();
  const [isChangingSettings, setChangingSettings] = useState(false);
  const [isTrashing, setTrashing] = useState(false);
  const name = localized(form.label, locale);
  const mayManage = session.data !== null && session.data !== undefined && session.data.role !== 'author';
  // A form with nothing to fill in is shown its fields first: that is what it needs next.
  const [tab, setTab] = useState(form.fields.length === 0 || !mayManage ? 'fields' : 'submissions');

  return (
    <Box paddingX={12} paddingY={10}>
      <Stack gap={6}>
        <Stack gap={2}>
          <Link href={paths.forms}>{messages.forms.backToForms}</Link>
          <PageHeader
            title={name}
            description={messages.forms.detail(form.key, form.open ? messages.forms.open : messages.forms.closed)}
            actions={
              mayManage && (
                <Inline gap={2}>
                  <Button variant="ghost" icon={Trash2} onPress={() => setTrashing(true)}>
                    {messages.forms.trash}
                  </Button>
                  <Button variant="secondary" icon={Settings2} onPress={() => setChangingSettings(true)}>
                    {messages.forms.settings}
                  </Button>
                </Inline>
              )
            }
          />
        </Stack>
        <Tabs
          label={messages.forms.tabs}
          selected={tab}
          onChange={setTab}
          tabs={[
            { id: 'submissions', label: messages.forms.tabSubmissions, content: mayManage ? <Submissions form={form} /> : <Text tone="muted">{messages.forms.noAccess}</Text> },
            { id: 'fields', label: messages.forms.tabFields, content: <FormFields form={form} mayChange={mayManage} /> },
          ]}
        />
      </Stack>
      {isChangingSettings && <FormSettingsDialog form={form} onClose={() => setChangingSettings(false)} />}
      <ConfirmDialog
        isOpen={isTrashing}
        onOpenChange={setTrashing}
        title={messages.forms.trashTitle(name)}
        confirmLabel={messages.forms.trashConfirm}
        cancelLabel={messages.editor.cancel}
        tone="danger"
        isPending={trash.isPending}
        onConfirm={() =>
          trash.mutate(form.id, {
            onSuccess: () => {
              toast({ title: messages.forms.trashed(name), tone: 'success' });
              go(paths.forms);
            },
            onError: (error) => {
              toast({ title: messages.forms.notTrashed, description: messageOf(error), tone: 'danger' });
              setTrashing(false);
            },
          })
        }
      >
        {messages.forms.trashDescription}
      </ConfirmDialog>
    </Box>
  );
}
