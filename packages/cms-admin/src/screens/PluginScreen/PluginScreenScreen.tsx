import { Box, EmptyState, PageHeader, Stack } from '@velocity-astro/cms-ui';
import { FileQuestion } from 'lucide-react';
import { useParams } from 'react-router';
import { useMessages } from '../../messages/messages-context.js';
import { PluginBoundary } from '../../plugins/PluginBoundary.js';
import { usePluginExtensions } from '../../plugins/plugin-editor.js';

/** A screen a plugin added: the editor's frame and heading around what the plugin draws. */
export function PluginScreenScreen() {
  const messages = useMessages();
  const { pluginName = '', screenId = '' } = useParams();
  const { screens } = usePluginExtensions();
  const screen = screens.find((candidate) => candidate.plugin === pluginName && candidate.id === screenId);

  return (
    <Box paddingX={12} paddingY={10}>
      {screen ? (
        <Stack gap={6}>
          <PageHeader title={screen.label} {...(screen.description !== undefined && { description: screen.description })} />
          {/* Made anew for each screen, so one screen's fault is not shown on the next. */}
          <PluginBoundary key={`${screen.plugin}/${screen.id}`}>
            <screen.Component />
          </PluginBoundary>
        </Stack>
      ) : (
        <EmptyState icon={FileQuestion} title={messages.plugins.screenMissingTitle} description={messages.plugins.screenMissingDescription} />
      )}
    </Box>
  );
}
