import { Text } from '@velocity-astro/cms-ui';
import { useLocale, useMessages } from '../messages/messages-context.js';

export interface ChangedElsewhereProps {
  /** What was changed in this form and, since it opened, somewhere else too, by the names the form shows. None shows nothing. */
  readonly names: readonly string[];
}

/** Said in a form that is open over something someone else changed meanwhile, before it is saved over theirs. */
export function ChangedElsewhere({ names }: ChangedElsewhereProps) {
  const messages = useMessages();
  const locale = useLocale();
  if (names.length === 0) return null;
  return (
    <Text size="sm" tone="danger">
      {messages.app.changedElsewhere(new Intl.ListFormat(locale, { type: 'conjunction' }).format(names), names.length)}
    </Text>
  );
}
