import type { ContentTypeDef, Entry } from '@velocity-astro/cms-core';
import { Card, Stack, Text } from '@velocity-astro/cms-ui';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { useLikeCounts } from '../../client/queries.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';

/**
 * How many visitors liked an entry, for a type that takes likes. A like holds nothing about who
 * pressed it, so the card is there for everyone who may read the entry.
 */
export function EntryLikes({ type, entry }: { readonly type: ContentTypeDef; readonly entry: Entry | null }) {
  if (type.likes === undefined || entry === null) return null;
  return <LikesOf type={type} entry={entry} />;
}

function LikesOf({ type, entry }: { readonly type: ContentTypeDef; readonly entry: Entry }) {
  const messages = useMessages();
  const locale = useLocale();
  const counts = useLikeCounts(type.id, true);
  const count = counts.data?.[entry.translationGroup] ?? 0;
  const onSite = entry.published !== undefined;
  return (
    <Card title={messages.editor.likesTitle} description={!onSite ? messages.editor.likesNotOnSite : type.likes?.showCount === true ? messages.editor.likesShown : messages.editor.likesHidden}>
      {counts.isPending && <LoadingState shape="summary" />}
      {counts.isError && <ErrorState error={counts.error} onRetry={() => void counts.refetch()} />}
      {counts.isSuccess && (
        <Stack gap={1}>
          <Text size="lg" weight="semibold">
            {count === 0 ? messages.editor.likesNone : messages.editor.likesCount(count, new Intl.NumberFormat(locale).format(count))}
          </Text>
        </Stack>
      )}
    </Card>
  );
}
