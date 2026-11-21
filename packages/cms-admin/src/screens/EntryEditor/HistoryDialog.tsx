import { useState } from 'react';
import type { ContentTypeDef, Entry, Revision } from '@velocity-astro/cms-core';
import { liveFields } from '@velocity-astro/cms-core';
import { Button, Dialog, Inline, Stack, Tag, Text, toast } from '@velocity-astro/cms-ui';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { useEntryHistory, useRevertEntry, useTeam } from '../../client/queries.js';
import { localized } from '../../lib/content.js';
import { relativeTime } from '../../lib/relative-time.js';
import { sittings } from '../../lib/sittings.js';
import { useClosing } from '../../lib/use-closing.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';

export interface HistoryDialogProps {
  readonly type: ContentTypeDef;
  readonly entry: Entry;
  /** Whether the form holds something not saved yet, which bringing a version back would replace. */
  readonly hasChanges: boolean;
  /** Called with the entry once an earlier version is its working version. */
  readonly onReverted: (entry: Entry) => void;
  readonly onClose: () => void;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * The saves of an entry, the latest first, with what each changed and who made it. Saves made in
 * one go are one row that opens. An earlier
 * one is brought back as a new save: the history only grows, and the site waits for a publish.
 */
export function HistoryDialog({ type, entry, hasChanges, onReverted, onClose }: HistoryDialogProps) {
  const messages = useMessages();
  const locale = useLocale();
  const history = useEntryHistory(entry.id);
  const team = useTeam();
  const revert = useRevertEntry();
  const { close, dialog } = useClosing(onClose);
  const fields = liveFields(type.fields);
  const revisions = history.data ?? [];
  // Saves made in one go are shown as one, since a draft saves itself every few seconds of work.
  const folded = sittings(revisions, entry.published?.revision);
  const [opened, setOpened] = useState<ReadonlySet<number>>(new Set());

  /** What a save did, from what the one before it held. */
  const about = (revision: Revision, before: Revision | undefined) => {
    if (!before) return messages.history.first;
    const changed = fields.filter((field) => !same(revision.data[field.id], before.data[field.id])).map((field) => localized(field.label, locale));
    if (changed.length > 0) return messages.history.changed(changed);
    if (revision.status !== before.status) return revision.status === 'published' ? messages.history.published : messages.history.unpublished;
    return revision.status === 'published' ? messages.history.published : messages.history.saved;
  };

  const bringBack = (revision: Revision) => {
    const when = relativeTime(revision.createdAt, locale);
    revert.mutate(
      { id: entry.id, revision: revision.revision, expectedRevision: entry.revision },
      {
        onSuccess: (reverted) => {
          toast({ title: messages.history.broughtBack(when), description: messages.history.broughtBackDescription, tone: 'success' });
          onReverted(reverted);
          close();
        },
        onError: (error) => toast({ title: messages.history.notBroughtBack, description: error.message, tone: 'danger' }),
      },
    );
  };

  return (
    <Dialog {...dialog} placement="side" title={messages.history.title} closeLabel={messages.history.close}>
      {history.isPending ? (
        <LoadingState shape="summary" />
      ) : history.isError ? (
        <ErrorState error={history.error} onRetry={() => void history.refetch()} />
      ) : (
        <Stack gap={6}>
          <Text tone="muted">{hasChanges ? messages.history.saveFirst : messages.history.help}</Text>
          {folded.map((sitting) => {
            const isOpened = opened.has(sitting.latest.revision);
            const shown = isOpened ? [sitting.latest, ...sitting.earlier] : [sitting.latest];
            // What came before the whole sitting, which is what the sitting as one is told against.
            const beforeAll = revisions[revisions.indexOf(sitting.earlier.at(-1) ?? sitting.latest) + 1];
            return (
              <Stack key={sitting.latest.revision} gap={4}>
                {shown.map((revision) => {
                  const by = (team.data ?? []).find((member) => member.id === revision.actorId)?.name;
                  const isCurrent = revision.revision === entry.revision;
                  return (
                    <Stack key={revision.revision} gap={2}>
                      <Inline gap={2}>
                        {isCurrent && <Tag tone="info">{messages.history.current}</Tag>}
                        {entry.published?.revision === revision.revision && <Tag tone="success">{messages.history.onSite}</Tag>}
                        <Text size="sm" tone="muted">
                          {messages.history.when(relativeTime(revision.createdAt, locale), by)}
                        </Text>
                      </Inline>
                      <Text>{about(revision, isOpened ? revisions[revisions.indexOf(revision) + 1] : beforeAll)}</Text>
                      {!isCurrent && !same(revision.data, entry.data) && (
                        <Inline>
                          <Button
                            variant="secondary"
                            size="sm"
                            isDisabled={hasChanges || revert.isPending}
                            isPending={revert.isPending && revert.variables?.revision === revision.revision}
                            onPress={() => bringBack(revision)}
                          >
                            {messages.history.bringBack}
                          </Button>
                        </Inline>
                      )}
                    </Stack>
                  );
                })}
                {sitting.earlier.length > 0 && (
                  <Inline gap={2}>
                    <Text size="sm" tone="muted">
                      {messages.history.sitting(sitting.earlier.length + 1)}
                    </Text>
                    <Button
                      variant="ghost"
                      size="sm"
                      onPress={() =>
                        setOpened((before) => {
                          const next = new Set(before);
                          if (isOpened) next.delete(sitting.latest.revision);
                          else next.add(sitting.latest.revision);
                          return next;
                        })
                      }
                    >
                      {isOpened ? messages.history.showAsOne : messages.history.showEach}
                    </Button>
                  </Inline>
                )}
              </Stack>
            );
          })}
        </Stack>
      )}
    </Dialog>
  );
}
