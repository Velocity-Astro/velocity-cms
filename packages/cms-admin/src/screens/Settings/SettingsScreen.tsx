import { Box, PageHeader, Stack, Tabs } from '@velocity-astro/cms-ui';
import type { ReactNode } from 'react';
import { useParams } from 'react-router';
import { SETTINGS_AREAS, paths, type SettingsAreaId } from '../../app/paths.js';
import { useGo } from '../../app/use-go.js';
import { useMessages } from '../../messages/messages-context.js';
import { EmailSettingsPanel } from './EmailSettings.js';
import { GeneralSettingsPanel } from './GeneralSettings.js';
import { StorageSettingsPanel } from './StorageSettings.js';

const isArea = (value: string | undefined): value is SettingsAreaId => SETTINGS_AREAS.some((area) => area === value);

/** What an owner sets up for the site without touching the server: one tab for each part. */
export function SettingsScreen() {
  const messages = useMessages();
  const go = useGo();
  const { area } = useParams();
  const content: Readonly<Record<SettingsAreaId, ReactNode>> = { general: <GeneralSettingsPanel />, email: <EmailSettingsPanel />, storage: <StorageSettingsPanel /> };

  return (
    <Box paddingX={12} paddingY={10}>
      <Stack gap={6}>
        <PageHeader title={messages.settings.title} description={messages.settings.description} />
        <Tabs
          label={messages.settings.tabsLabel}
          selected={isArea(area) ? area : SETTINGS_AREAS[0]}
          onChange={(id) => isArea(id) && go(paths.settings(id))}
          tabs={SETTINGS_AREAS.map((id) => ({ id, label: messages.settings.areas[id], content: content[id] }))}
        />
      </Stack>
    </Box>
  );
}
