import type { PluginInfo } from '@velocity/cms-core';
import { Box, EmptyState, Inline, PageHeader, Stack, Table, Tag, Text, type TableColumn, type TableRow } from '@velocity/cms-ui';
import { Puzzle } from 'lucide-react';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { usePlugins } from '../../client/queries.js';
import { localized } from '../../lib/content.js';
import { relativeTime } from '../../lib/relative-time.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';

const TONES = { on: 'success', failed: 'danger', unsupported: 'warning', invalid: 'danger' } as const;

/** The plugins the site's config names: which are running, which were left out, and why. */
export function PluginsScreen() {
  const messages = useMessages();
  const locale = useLocale();
  const plugins = usePlugins();

  const columns: TableColumn[] = [
    { id: 'name', label: messages.plugins.columnName },
    { id: 'state', label: messages.plugins.columnState },
    { id: 'may', label: messages.plugins.columnMay },
  ];
  /** What went wrong, most pressing first: why it is off, else the last time it failed while running. */
  const trouble = (plugin: PluginInfo) =>
    plugin.problem ?? (plugin.lastFault ? messages.plugins.failedAt(plugin.faults, plugin.lastFault.where, relativeTime(plugin.lastFault.at, locale), plugin.lastFault.message) : null);
  const rows: TableRow[] = (plugins.data ?? []).map((plugin) => {
    const description = plugin.description ? localized(plugin.description, locale) : null;
    const problem = trouble(plugin);
    return {
      id: plugin.name,
      cells: {
        name: (
          <Stack gap={0}>
            <Inline gap={2}>
              <Text weight="semibold">{localized(plugin.label, locale)}</Text>
              {plugin.version !== undefined && (
                <Text size="sm" tone="muted">
                  {messages.plugins.version(plugin.version)}
                </Text>
              )}
            </Inline>
            <Text size="sm" tone="muted">
              {description ?? plugin.name}
            </Text>
          </Stack>
        ),
        state: (
          <Stack gap={1}>
            <Inline gap={2}>
              <Tag tone={TONES[plugin.status]}>{messages.plugins.states[plugin.status]}</Tag>
              {plugin.status === 'on' && plugin.faults > 0 && <Tag tone="warning">{messages.plugins.hasFailed}</Tag>}
            </Inline>
            {problem !== null && <Text size="sm">{problem}</Text>}
          </Stack>
        ),
        may: (
          <Text size="sm" tone="muted">
            {plugin.permissions.length === 0 ? messages.plugins.mayNothing : plugin.permissions.map((permission) => messages.plugins.permissions[permission]).join(', ')}
          </Text>
        ),
      },
    };
  });

  return (
    <Box paddingX={12} paddingY={10}>
      <Stack gap={6}>
        <PageHeader title={messages.plugins.title} description={messages.plugins.description} />
        {plugins.isPending && <LoadingState shape="table" />}
        {plugins.isError && <ErrorState error={plugins.error} onRetry={() => void plugins.refetch()} />}
        {plugins.isSuccess && rows.length === 0 && <EmptyState icon={Puzzle} title={messages.plugins.emptyTitle} description={messages.plugins.emptyDescription} />}
        {plugins.isSuccess && rows.length > 0 && <Table label={messages.plugins.title} columns={columns} rows={rows} />}
      </Stack>
    </Box>
  );
}
