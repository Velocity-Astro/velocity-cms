import { liveFields, type CustomFieldsOf } from '@velocity-astro/cms-core';
import { Button, Dialog, Stack, Text } from '@velocity-astro/cms-ui';
import { ErrorState, LoadingState } from '../app/RequestState.js';
import { useCustomFields, useSaveCustomFields } from '../client/queries.js';
import { useClosing } from '../lib/use-closing.js';
import { useMessages } from '../messages/messages-context.js';
import { FieldSetEditor } from './FieldSetEditor.js';
import type { FieldSet } from './field-set.js';

/** The window the site's own fields for contacts, or for deals, are added, changed, ordered and removed in. */
export function CustomFieldsDialog({ of, onClose }: { readonly of: CustomFieldsOf; readonly onClose: () => void }) {
  const { close, dialog } = useClosing(onClose);
  const messages = useMessages();
  const fields = useCustomFields();
  const save = useSaveCustomFields();
  const words = messages.customFields[of];
  const set: FieldSet | null = fields.data
    ? {
        name: words.name,
        fields: liveFields(fields.data[of]),
        isPending: save.isPending,
        // The whole list goes each time, each field with its id, so what was filled in stays under it.
        save: (next, handlers) => save.mutate({ [of]: next, expectedRevision: fields.data.revision }, handlers),
        canRequire: false,
        words: { emptyDescription: words.emptyDescription, nameHelp: messages.customFields.nameHelp, removeDescription: messages.customFields.removeDescription },
      }
    : null;

  return (
    <Dialog
      {...dialog}
      title={words.title}
      closeLabel={messages.app.dismiss}
      size="lg"
      footer={
        <Button variant="secondary" onPress={close}>
          {messages.customFields.close}
        </Button>
      }
    >
      <Stack gap={4}>
        <Text tone="secondary">{words.help}</Text>
        {fields.isPending && <LoadingState shape="table" />}
        {fields.isError && <ErrorState error={fields.error} onRetry={() => void fields.refetch()} />}
        {set && <FieldSetEditor set={set} mayChange />}
      </Stack>
    </Dialog>
  );
}
