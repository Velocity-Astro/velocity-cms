import type { PluginInfo, PluginTask } from '@velocity/cms-core';
import { Button, Dialog, EmptyState, Stack, Table, Tag, Text, toast, type TableColumn, type TableRow } from '@velocity/cms-ui';
import { History, RotateCw } from 'lucide-react';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { usePluginTasks, useRetryPluginTask } from '../../client/queries.js';
import { localized } from '../../lib/content.js';
import { relativeTime } from '../../lib/relative-time.js';
import { useClosing } from '../../lib/use-closing.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';

const TONES = { waiting: 'warning', done: 'success', failed: 'danger' } as const;
const SOON_MS = 90_000;
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** What a plugin was asked to send or do: what waits, what was done, and what was given up on, with a way to try that again. */
export function PluginActivityDialog({ plugin, onClose }: { readonly plugin: PluginInfo; readonly onClose: () => void }) {
  const { close, dialog } = useClosing(onClose);
  const messages = useMessages();
  const locale = useLocale();
  const name = localized(plugin.label, locale);
  const tasks = usePluginTasks(plugin.name, true);
  const retry = useRetryPluginTask(plugin.name);

  const again = (task: PluginTask) =>
    retry.mutate(task.id, {
      onSuccess: (now) =>
        now.status === 'done'
          ? toast({ title: messages.plugins.taskRetried, tone: 'success' })
          : toast({ title: messages.plugins.taskRetriedWaiting, ...(now.lastError !== undefined && { description: now.lastError }), tone: 'danger' }),
      onError: (error) => toast({ title: messages.plugins.taskNotRetried, description: messageOf(error), tone: 'danger' }),
    });

  /** When it is tried next. Under a minute away, a relative time would only say "now". */
  const nextTry = (nextAt: string) => (Date.parse(nextAt) - Date.now() < SOON_MS ? messages.plugins.taskNextSoon : messages.plugins.taskNext(relativeTime(nextAt, locale)));

  const columns: TableColumn[] = [
    { id: 'what', label: messages.plugins.taskWhat },
    { id: 'state', label: messages.plugins.taskState },
    { id: 'when', label: messages.plugins.taskWhen },
    { id: 'actions', label: messages.plugins.taskActions, align: 'end' },
  ];
  const rows: TableRow[] = (tasks.data ?? []).map((task) => {
    const what = task.label ?? task.kind;
    return {
      id: task.id,
      cells: {
        what: (
          <Stack gap={0}>
            <Text weight="semibold">{what}</Text>
            {task.status !== 'done' && task.lastError !== undefined && <Text size="sm">{task.lastError}</Text>}
          </Stack>
        ),
        state: (
          <Stack gap={1}>
            <Tag tone={TONES[task.status]}>{messages.plugins.taskStates[task.status]}</Tag>
            <Text size="sm" tone="muted">
              {task.status === 'waiting' && task.nextAt !== undefined ? `${messages.plugins.taskTries(task.attempts)}. ${nextTry(task.nextAt)}` : messages.plugins.taskTries(task.attempts)}
            </Text>
          </Stack>
        ),
        when: (
          <Text size="sm" tone="muted">
            {relativeTime(task.createdAt, locale)}
          </Text>
        ),
        actions: task.canRetry ? (
          <Button variant="secondary" size="sm" icon={RotateCw} isPending={retry.isPending && retry.variables === task.id} onPress={() => again(task)}>
            {messages.plugins.taskRetry(what)}
          </Button>
        ) : null,
      },
    };
  });

  return (
    <Dialog
      {...dialog}
      title={messages.plugins.activityTitle(name)}
      closeLabel={messages.app.dismiss}
      size="lg"
      footer={
        <Button variant="secondary" onPress={close}>
          {messages.plugins.activityClose}
        </Button>
      }
    >
      <Stack gap={4}>
        <Text tone="secondary">{messages.plugins.activityHelp}</Text>
        {tasks.isPending && <LoadingState shape="table" />}
        {tasks.isError && <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />}
        {tasks.isSuccess && rows.length === 0 && <EmptyState icon={History} title={messages.plugins.activityEmptyTitle} description={messages.plugins.activityEmptyDescription} />}
        {tasks.isSuccess && rows.length > 0 && <Table label={messages.plugins.activityTitle(name)} columns={columns} rows={rows} />}
      </Stack>
    </Dialog>
  );
}
