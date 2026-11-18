import type { Entry } from '@velocity/cms-core';
import { Button, DateField, Dialog, Inline, Select, Stack, Text, toast } from '@velocity/cms-ui';
import { useState } from 'react';
import { AdminRequestError } from '../../client/errors.js';
import { useScheduleEntry, useUnscheduleEntry } from '../../client/queries.js';
import { useClosing } from '../../lib/use-closing.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';

export interface ScheduleDialogProps {
  readonly entry: Entry;
  /** Whether the form holds something not saved yet. What goes out is what is saved. */
  readonly hasChanges: boolean;
  readonly onClose: () => void;
}

const two = (value: number) => String(value).padStart(2, '0');
const dayOf = (date: Date) => `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
/** Every half hour of a day, as `HH:MM`. */
const TIMES = Array.from({ length: 48 }, (_, index) => `${two(Math.floor(index / 2))}:${index % 2 === 0 ? '00' : '30'}`);

/** A day and time as people read them, in their own time zone. */
export function scheduledFor(at: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(at));
}

/**
 * Sets an entry to go on the site at a day and time, in the time zone of whoever sets it, and
 * takes it off the schedule again. It also says why an entry missed its time.
 */
export function ScheduleDialog({ entry, hasChanges, onClose }: ScheduleDialogProps) {
  const messages = useMessages();
  const locale = useLocale();
  const schedule = useScheduleEntry();
  const unschedule = useUnscheduleEntry();
  const { close, dialog } = useClosing(onClose);
  // Tomorrow at nine, unless a time is already set.
  const [start] = useState(() => {
    if (entry.publishAt !== undefined) return new Date(entry.publishAt);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return tomorrow;
  });
  const [day, setDay] = useState<string | null>(dayOf(start));
  const [time, setTime] = useState(`${two(start.getHours())}:${start.getMinutes() < 30 ? '00' : '30'}`);
  const [problem, setProblem] = useState<string | null>(null);
  const isBusy = schedule.isPending || unschedule.isPending;
  const timeName = (value: string) => new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(new Date(`2000-01-01T${value}:00`));

  const set = () => {
    if (day === null) {
      setProblem(messages.schedule.dayMissing);
      return;
    }
    setProblem(null);
    const at = new Date(`${day}T${time}:00`).toISOString();
    schedule.mutate(
      { id: entry.id, at, expectedRevision: entry.revision },
      {
        onSuccess: (set) => {
          toast({ title: messages.schedule.set, description: messages.schedule.setDescription(scheduledFor(set.publishAt ?? at, locale)), tone: 'success' });
          close();
        },
        onError: (error) => {
          const aboutTime = error instanceof AdminRequestError ? error.issues.find((issue) => issue.path[0] === 'publishAt') : undefined;
          if (aboutTime) setProblem(aboutTime.message);
          else toast({ title: messages.schedule.notSet, description: error.message, tone: 'danger' });
        },
      },
    );
  };
  const remove = () =>
    unschedule.mutate(entry.id, {
      onSuccess: () => {
        toast({ title: messages.schedule.removed, tone: 'success' });
        close();
      },
      onError: (error) => toast({ title: messages.schedule.notRemoved, description: error.message, tone: 'danger' }),
    });

  return (
    <Dialog
      {...dialog}
      title={messages.schedule.title}
      closeLabel={messages.schedule.close}
      footer={
        <>
          {entry.publishAt !== undefined && (
            <Button variant="ghost" isDisabled={isBusy} isPending={unschedule.isPending} onPress={remove}>
              {messages.schedule.remove}
            </Button>
          )}
          <Button variant="secondary" isDisabled={isBusy} onPress={close}>
            {messages.schedule.cancel}
          </Button>
          <Button isDisabled={isBusy || hasChanges} isPending={schedule.isPending} onPress={set}>
            {entry.publishAt !== undefined ? messages.schedule.change : messages.schedule.confirm}
          </Button>
        </>
      }
    >
      <Stack gap={4}>
        {entry.publishProblem !== undefined && <Text tone="danger">{messages.schedule.missed(entry.publishProblem)}</Text>}
        {entry.publishAt !== undefined && <Text>{messages.schedule.current(scheduledFor(entry.publishAt, locale))}</Text>}
        <Text tone="muted">{hasChanges ? messages.schedule.saveFirst : messages.schedule.help}</Text>
        <Inline gap={3} align="start">
          <DateField label={messages.schedule.day} value={day} onChange={setDay} isRequired {...(problem !== null && { errorMessage: problem })} />
          <Select label={messages.schedule.time} value={time} onChange={setTime} options={TIMES.map((value) => ({ id: value, label: timeName(value) }))} />
        </Inline>
        <Text size="sm" tone="muted">
          {messages.schedule.zone(Intl.DateTimeFormat().resolvedOptions().timeZone)}
        </Text>
      </Stack>
    </Dialog>
  );
}
