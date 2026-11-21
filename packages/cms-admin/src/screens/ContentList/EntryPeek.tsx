import { Button, Card, Inline, SiteWindow, Stack, Tag, Text } from '@velocity-astro/cms-ui';
import type { ContentTypeDef, Entry } from '@velocity-astro/cms-core';
import { MousePointer2, PencilLine } from 'lucide-react';
import { paths } from '../../app/paths.js';
import { useGo } from '../../app/use-go.js';
import { useControlFor } from '../../fields/index.js';
import { entryAddress, entryState, entryTitle, type EntryState } from '../../lib/content.js';
import { openSite } from '../../lib/open-site.js';
import { relativeTime } from '../../lib/relative-time.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';

/** How each state is coloured. The words come from the messages. */
const STATE_TONE = { draft: 'neutral', scheduled: 'info', published: 'success', unpublishedChanges: 'warning' } as const satisfies Record<
  EntryState,
  string
>;

export interface EntryPeekProps {
  readonly type: ContentTypeDef;
  /** The entry in the list's language, and every language it is in. */
  readonly primary: Entry;
  readonly versions: readonly Entry[];
}

/**
 * The entry chosen in a list, beside it: where it stands, its page as visitors see it now, and the
 * ways into it. Only what is published is shown as the page; a draft says it is not on the site yet.
 */
export function EntryPeek({ type, primary, versions }: EntryPeekProps) {
  const messages = useMessages();
  const locale = useLocale();
  const go = useGo();
  const controlFor = useControlFor();
  const state = entryState(primary);
  const title = entryTitle(type, primary.data) ?? messages.contentList.untitled;
  const hasPage = type.urlPattern !== undefined || Object.keys(type.localizedUrlPatterns ?? {}).length > 0;
  // The visual editor is for an entry whose fields hold the page itself, as the entry's own screen decides.
  const showsPage = hasPage && type.fields.some((field) => field.deletedAt === undefined && controlFor(field.type)?.showsPage === true);
  const published = primary.published;
  const live = published === undefined ? null : entryAddress(type, { locale: primary.locale, slug: published.slug, data: published.data });
  const updated = versions.reduce((latest, entry) => (entry.updatedAt > latest ? entry.updatedAt : latest), primary.updatedAt);

  return (
    <Card title={title} actions={<Tag tone={STATE_TONE[state]}>{messages.status[state]}</Tag>}>
      <Stack gap={4}>
        {live !== null ? (
          <SiteWindow
            size="sm"
            address={`${window.location.host}${live}`}
            src={live}
            title={messages.contentList.peekPage(title)}
            label={messages.contentList.peekView}
            onPress={() => openSite(live)}
          />
        ) : (
          hasPage && (
            <Text size="sm" tone="muted">
              {messages.contentList.peekNotLive}
            </Text>
          )
        )}
        <Inline gap={2} wrap>
          {showsPage && (
            <Button icon={MousePointer2} onPress={() => go(paths.visualEntry(type.key, primary.id))}>
              {messages.contentList.peekVisual}
            </Button>
          )}
          <Button variant={showsPage ? 'secondary' : 'primary'} icon={PencilLine} onPress={() => go(paths.entry(type.key, primary.id))}>
            {messages.contentList.peekOpen}
          </Button>
        </Inline>
        <Stack gap={2}>
          <Inline justify="between" gap={3}>
            <Text size="sm" tone="muted">
              {messages.contentList.columnUpdated}
            </Text>
            <Text size="sm">{relativeTime(updated, locale)}</Text>
          </Inline>
          {published !== undefined && (
            <Inline justify="between" gap={3}>
              <Text size="sm" tone="muted">
                {messages.status.published}
              </Text>
              <Text size="sm">{relativeTime(published.at, locale)}</Text>
            </Inline>
          )}
          {versions.length > 1 && (
            <Inline justify="between" gap={3}>
              <Text size="sm" tone="muted">
                {messages.contentList.columnLanguages}
              </Text>
              <Inline gap={1}>
                {versions.map((entry) => (
                  <Tag key={entry.id}>{entry.locale.toUpperCase()}</Tag>
                ))}
              </Inline>
            </Inline>
          )}
        </Stack>
      </Stack>
    </Card>
  );
}
