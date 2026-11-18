import type { PluginInfo } from '@velocity/cms-core';
import { Box, Button, Card, EmptyState, Grid, PageHeader, Stack, Switch, Tag, Text, toast } from '@velocity/cms-ui';
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

  /** What went wrong, most pressing first: why it is off, else the last time it failed while running. */
  const trouble = (plugin: PluginInfo) =>
    plugin.problem ?? (plugin.lastFault ? messages.plugins.failedAt(plugin.faults, plugin.lastFault.where, relativeTime(plugin.lastFault.at, locale), plugin.lastFault.message) : null);
  const cards = (plugins.data ?? []).map((plugin) => {
    const problem = trouble(plugin);
    const name = localized(plugin.label, locale);
    // What activating it brings that a person will see, in words. What it listens for is left out: it says nothing of where to look.
    const screens = extensions.screens.filter((screen) => screen.plugin === plugin.name);
    const adds = [
      ...screens.map((screen) => messages.plugins.addsScreen(screen.label)),
      ...extensions.panels.filter((panel) => panel.plugin === plugin.name).map((panel) => messages.plugins.addsPanel(panel.title)),
      ...(plugin.adds.fieldTypes.length > 0 ? [messages.plugins.addsFieldTypes(plugin.adds.fieldTypes.length)] : []),
      ...(plugin.adds.checks > 0 ? [messages.plugins.addsChecks(plugin.adds.checks)] : []),
      ...(plugin.adds.pageHead ? [messages.plugins.addsPageHead] : []),
      ...(plugin.adds.tasks.length > 0 ? [messages.plugins.addsTasks] : []),
    ];
    const editorProblem = extensions.problems.get(plugin.name);
    const may = plugin.permissions.length === 0 ? [messages.plugins.mayNothing] : plugin.permissions.map((permission) => messages.plugins.permissions[permission]);
    const isOn = plugin.status === 'on';
    const hasFooter = screens.length > 0 || plugin.adds.tasks.length > 0 || plugin.hasSettings;
    return (
      <Card
        key={plugin.name}
        title={name}
        description={plugin.description ? localized(plugin.description, locale) : plugin.name}
        actions={
          <>
            {isOn && plugin.faults > 0 && <Tag tone="warning">{messages.plugins.hasFailed}</Tag>}
            <Tag tone={TONES[plugin.status]}>{messages.plugins.states[plugin.status]}</Tag>
            {SWITCHABLE.has(plugin.status) && (
              <Switch label={messages.plugins.active(name)} isLabelHidden isSelected={isOn} isDisabled={setEnabled.isPending} onChange={(isSelected) => flip(plugin, isSelected)} />
            )}
          </>
        }
        {...(hasFooter && {
          footer: (
            <>
              {plugin.hasSettings && (
                <Button variant="secondary" size="sm" icon={Settings2} onPress={() => setSettingUp(plugin)}>
                  {messages.plugins.settings}
                </Button>
              )}
              {plugin.adds.tasks.length > 0 && (
                <Button variant="ghost" size="sm" icon={History} onPress={() => setWatching(plugin)}>
                  {messages.plugins.activity}
                </Button>
              )}
              {screens.map((screen) => (
                <Button key={screen.id} variant="ghost" size="sm" icon={ArrowRight} onPress={() => go(paths.pluginScreen(screen.plugin, screen.id))}>
                  {messages.plugins.open(screen.label)}
                </Button>
              ))}
            </>
          ),
        })}
      >
        <Stack gap={2}>
          {problem !== null && <Text size="sm">{problem}</Text>}
          {editorProblem !== undefined && <Text size="sm">{messages.plugins.editorFailed(editorProblem)}</Text>}
          {isOn && adds.length > 0 && <Text size="sm">{messages.plugins.adds(adds)}</Text>}
          <Text size="sm" tone="muted">
            {[...(plugin.version !== undefined ? [messages.plugins.version(plugin.version)] : []), messages.plugins.may(may)].join(' · ')}
          </Text>
        </Stack>
      </Card>
    );
  });

  return (
    <Box paddingX={12} paddingY={10}>
      <Stack gap={6}>
        <PageHeader title={messages.plugins.title} description={messages.plugins.description} />
        {plugins.isPending && <LoadingState shape="summary" />}
        {plugins.isError && <ErrorState error={plugins.error} onRetry={() => void plugins.refetch()} />}
        {plugins.isSuccess && cards.length === 0 && <EmptyState icon={Puzzle} title={messages.plugins.emptyTitle} description={messages.plugins.emptyDescription} />}
        {plugins.isSuccess && cards.length > 0 && (
          <Grid columns={2} gap={4}>
            {cards}
          </Grid>
        )}
      </Stack>
      {/* Made anew each time it opens, so it never shows another plugin's settings. */}
      {settingUp && <PluginSettingsDialog key={settingUp.name} plugin={settingUp} onClose={() => setSettingUp(null)} />}
      {watching && <PluginActivityDialog key={watching.name} plugin={watching} onClose={() => setWatching(null)} />}
    </Box>
  );
}
