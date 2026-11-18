import type { PipelineStage, TeamMember } from '@velocity-astro/cms-core';
import { useLocale, useMessages } from '../../messages/messages-context.js';

/** Says what a stage is called: the team's name for it, or the CMS's own for one that was never renamed. */
export function useStageName(): (stage: PipelineStage | undefined) => string {
  const messages = useMessages();
  const builtIn: Readonly<Record<string, string>> = messages.contacts.stages;
  return (stage) => (stage === undefined ? '' : (stage.label ?? builtIn[stage.id] ?? stage.id));
}

/** How a stage's kind is coloured, on a tag or a board. */
export const STAGE_TONE = { open: 'neutral', won: 'success', lost: 'danger' } as const;

/** Today where the person is, as `2026-03-14`. */
export function today(): string {
  const now = new Date();
  const two = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

/** Says a day to follow up as a person reads it, and how pressing it is. */
export function useFollowUp(): (day: string) => { readonly text: string; readonly tone: 'neutral' | 'warning' | 'danger' } {
  const messages = useMessages();
  const locale = useLocale();
  const now = today();
  return (day) => {
    if (day < now) return { text: messages.contacts.due.overdue, tone: 'danger' };
    if (day === now) return { text: messages.contacts.due.today, tone: 'warning' };
    return { text: dayText(day, locale), tone: 'neutral' };
  };
}

/** `2026-03-14` as the person's language writes a day. */
export function dayText(day: string, locale: string): string {
  const date = new Date(`${day}T00:00:00`);
  return Number.isNaN(date.getTime()) ? day : new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

/** Says who looks after a contact, by name. */
export function useOwnerName(team: readonly TeamMember[] | undefined): (ownerId: string | undefined) => string {
  const messages = useMessages();
  return (ownerId) => {
    if (ownerId === undefined) return '';
    // The team is still on its way, or the person can no longer sign in.
    return team?.find((member) => member.id === ownerId)?.name ?? (team === undefined ? '' : messages.contacts.someoneWhoLeft);
  };
}

/** Says an amount of money in the pipeline's currency, in whole units, as the person's language writes it. */
export function useMoney(currency: string | undefined): (value: number) => string {
  const locale = useLocale();
  return (value) => {
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency: currency ?? 'USD', maximumFractionDigits: 0 }).format(value);
    } catch {
      // Three letters that are no currency Intl knows.
      return `${new Intl.NumberFormat(locale).format(value)} ${currency ?? ''}`.trim();
    }
  };
}
