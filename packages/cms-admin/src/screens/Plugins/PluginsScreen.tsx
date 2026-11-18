import type { PluginInfo } from '@velocity/cms-core';
import { Box, Button, EmptyState, Inline, PageHeader, Stack, Switch, Table, Tag, Text, toast, type TableColumn, type TableRow } from '@velocity/cms-ui';
import { ArrowRight, History, Puzzle, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { paths } from '../../app/paths.js';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { useGo } from '../../app/use-go.js';
import { usePlugins, useSetPluginEnabled } from '../../client/queries.js';
import { localized } from '../../lib/content.js';
import { relativeTime } from '../../lib/relative-time.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';
import { usePluginExtensions } from '../../plugins/plugin-editor.js';
import { PluginActivityDialog } from './PluginActivityDialog.js';
import { PluginSettingsDialog } from './PluginSettingsDialog.js';

const TONES = { on: 'success', off: 'neutral', failed: 'danger', unsupported: 'warning', invalid: 'danger' } as const;
/** The states an owner can change with the switch. The others are a developer's to fix. */
const SWITCHABLE: ReadonlySet<string> = new Set(['on', 'off', 'failed']);
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Every plugin this site can use: which are active, a switch for each, their settings, and why one could not start. */
export function PluginsScreen() {
  const messages = useMessages();
  const locale = useLocale();
  const plugins = usePlugins();
  const setEnabled = useSetPluginEnabled();
  const go = useGo();
  const extensions = usePluginExtensions();
  const [settingUp, setSettingUp] = useState<PluginInfo | null>(null);
  const [watching, setWatching] = useState<PluginInfo | null>(null);

  const flip = (plugin: PluginInfo, enabled: boolean) => {
    const name = localized(plugin.label, locale);
    setEnabled.mutate(
      { name: plugin.name, enabled },
      {
        onSuccess: (now) => {
          if (!enabled) return toast({ title: messages.plugins.deactivated(name), description: messages.plugins.deactivatedDescription });
          // Asked to start and could not: the reason is the plugin's own, shown in its row too.
          if (now.status !== 'on') return toast({ title: messages.plugins.notActivated(name), ...(now.problem !== undefined && { description: now.problem }), tone: 'danger' });
          toast({ title: messages.plugins.activated(name), description: messages.plugins.activatedDescription, tone: 'success' });
        },
        onError: (error) => toast({ title: messages.plugins.notSwitched, description: messageOf(error), tone: 'danger' }),
      },
    );
  };

  const columns: TableColumn[] = [
    { id: 'name', label: messages.plugins.columnName },
    { id: 'state', label: messages.plugins.columnState },
    { id: 'may', label: messages.plugins.columnMay },
    { id: 'actions', label: messages.plugins.columnActions, align: 'end' },
  ];
  /** What went wrong, most pressing first: why it is off, else the last time it failed while running. */
  const trouble = (plugin: PluginInfo) =>
    plugin.problem ?? (plugin.lastFault ? messages.plugins.failedAt(plugin.faults, plugin.lastFault.where, relativeTime(plugin.lastFault.at, locale), plugin.lastFault.message) : null);
  const rows: TableRow[] = (plugins.data ?? []).map((plugin) => {
    const description = plugin.description ? localized(plugin.description, locale) : null;
    const problem = trouble(plugin);
    const name = localized(plugin.label, locale);
    // What activating it brings, in words: what it added to this editor, then what it does on the server.
    const screens = extensions.screens.filter((screen) => screen.plugin === plugin.name);
    const adds = [
      ...screens.map((screen) => messages.plugins.addsScreen(screen.label)),
      ...extensions.panels.filter((panel) => panel.plugin === plugin.name).map((panel) => messages.plugins.addsPanel(panel.title)),
      ...(plugin.adds.fieldTypes.length > 0 ? [messages.plugins.addsFieldTypes(plugin.adds.fieldTypes.length)] : []),
      ...(plugin.adds.checks > 0 ? [messages.plugins.addsChecks(plugin.adds.checks)] : []),
      ...(plugin.adds.pageHead ? [messages.plugins.addsPageHead] : []),
      ...(plugin.adds.tasks.length > 0 ? [messages.plugins.addsTasks] : []),
      ...(plugin.adds.events.length > 0 ? [messages.plugins.addsEvents(plugin.adds.events.map((event) => messages.plugins.events[event] ?? event))] : []),
    ];
    const editorProblem = extensions.problems.get(plugin.name);
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
            {plugin.status === 'on' && <Text size="sm">{adds.length > 0 ? messages.plugins.adds(adds) : messages.plugins.addsNothing}</Text>}
          </Stack>
        ),
        state: (
          <Stack gap={1}>
            <Inline gap={2}>
              <Tag tone={TONES[plugin.status]}>{messages.plugins.states[plugin.status]}</Tag>
              {plugin.status === 'on' && plugin.faults > 0 && <Tag tone="warning">{messages.plugins.hasFailed}</Tag>}
            </Inline>
            {problem !== null && <Text size="sm">{problem}</Text>}
            {editorProblem !== undefined && <Text size="sm">{messages.plugins.editorFailed(editorProblem)}</Text>}
          </Stack>
        ),
        may: (
          <Text size="sm" tone="muted">
            {plugin.permissions.length === 0 ? messages.plugins.mayNothing : plugin.permissions.map((permission) => messages.plugins.permissions[permission]).join(', ')}
          </Text>
        ),
        actions: (
          <Inline gap={3} justify="end">
            {screens.map((screen) => (
              <Button key={screen.id} variant="ghost" size="sm" icon={ArrowRight} onPress={() => go(paths.pluginScreen(screen.plugin, screen.id))}>
                {messages.plugins.open(screen.label)}
              </Button>
            ))}
            {plugin.adds.tasks.length > 0 && (
              <Button variant="ghost" size="sm" icon={History} onPress={() => setWatching(plugin)}>
                {messages.plugins.activityOf(name)}
              </Button>
            )}
            {plugin.hasSettings && (
              <Button variant="secondary" size="sm" icon={Settings2} onPress={() => setSettingUp(plugin)}>
                {messages.plugins.settingsOf(name)}
              </Button>
            )}
            {SWITCHABLE.has(plugin.status) && (
              <Switch label={messages.plugins.active(name)} isSelected={plugin.status === 'on'} isDisabled={setEnabled.isPending} onChange={(isSelected) => flip(plugin, isSelected)} />
            )}
          </Inline>
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
      {/* Made anew each time it opens, so it never shows another plugin's settings. */}
      {settingUp && <PluginSettingsDialog key={settingUp.name} plugin={settingUp} onClose={() => setSettingUp(null)} />}
      {watching && <PluginActivityDialog key={watching.name} plugin={watching} onClose={() => setWatching(null)} />}
    </Box>
  );
}
