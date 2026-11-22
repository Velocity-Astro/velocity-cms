import { Box, EmptyState, PageHeader, Stack, Tabs } from '@velocity-astro/cms-ui';
import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router';
import { SETTINGS_AREAS, paths, type SettingsAreaId } from '../../app/paths.js';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { useGo } from '../../app/use-go.js';
import { useContentTypes, useSession } from '../../client/queries.js';
import { localized } from '../../lib/content.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';
import { EmailSettingsPanel } from './EmailSettings.js';
import { FormsSettingsPanel } from './FormsSettings.js';
import { GeneralSettingsPanel } from './GeneralSettings.js';
import { SettingsPagePanel } from './SettingsPage.js';
import { StorageSettingsPanel } from './StorageSettings.js';
import { TokensPanel } from './TokensSettings.js';

/** A tab's id for a page of the settings. An area's own id never starts this way. */
const PAGE = 'page:';

/**
 * What a site is set up with, one tab for each part: the pages a template keeps here (what the
 * business is called, its logo, how to reach it), then what an owner sets up without touching
 * the server.
 */
export function SettingsScreen() {
  const messages = useMessages();
  const locale = useLocale();
  const go = useGo();
  const { area, typeKey } = useParams();
  const types = useContentTypes();
  const session = useSession();

  if (types.isPending) return <LoadingState shape="form" />;
  if (types.isError) return <ErrorState error={types.error} onRetry={() => void types.refetch()} />;

  const pages = types.data.filter((type) => type.inSettings === true);
  // Where a page already says what the site is called, there is no second field for it.
  const named = pages.some((type) => type.siteNamePath !== undefined);
  const areas: Readonly<Record<SettingsAreaId, ReactNode>> = { general: <GeneralSettingsPanel />, email: <EmailSettingsPanel />, storage: <StorageSettingsPanel />, forms: <FormsSettingsPanel />, tokens: <TokensPanel /> };
  const tabs = [
    ...pages.map((type) => ({ id: `${PAGE}${type.key}`, label: localized(type.label, locale), content: <SettingsPagePanel type={type} />, href: paths.settingsPage(type.key) })),
    // The server's settings are an owner's.
    ...(session.data?.role === 'owner'
      ? SETTINGS_AREAS.filter((id) => id !== 'general' || !named).map((id) => ({ id, label: messages.settings.areas[id], content: areas[id], href: paths.settings(id) }))
      : []),
  ];
  const asked = typeKey !== undefined ? `${PAGE}${typeKey}` : area;
  const selected = tabs.find((tab) => tab.id === asked) ?? tabs[0];

  return (
    <Box paddingX={12} paddingY={10}>
      <Stack gap={6}>
        <PageHeader title={messages.settings.title} description={messages.settings.description} />
        {selected === undefined && <EmptyState icon={Lock} title={messages.settings.ownersTitle} description={messages.settings.ownersDescription} />}
        {selected !== undefined && (
          <Tabs
            label={messages.settings.tabsLabel}
            selected={selected.id}
            onChange={(id) => {
              const next = tabs.find((tab) => tab.id === id);
              if (next) go(next.href);
            }}
            tabs={tabs.map(({ id, label, content }) => ({ id, label, content }))}
          />
        )}
      </Stack>
    </Box>
  );
}
