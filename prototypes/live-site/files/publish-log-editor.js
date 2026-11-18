/**
 * The Publish log plugin's part of the editor. One ready-made file: it brings no React and no
 * styles of its own, and builds its screen from what the editor hands it.
 */
export default function publishLog({ React, ui, client, register }) {
  const h = React.createElement;
  const { Button, Card, EmptyState, Inline, Skeleton, Stack, Table, Text } = ui;

  function PublishLogScreen() {
    const [state, setState] = React.useState({ status: 'loading' });
    const load = React.useCallback(() => {
      setState({ status: 'loading' });
      client.get('/log').then(
        (answer) => setState({ status: 'done', items: answer.items }),
        (error) => setState({ status: 'failed', message: error instanceof Error ? error.message : String(error) }),
      );
    }, []);
    React.useEffect(load, [load]);

    if (state.status === 'loading') {
      return h(Card, null, h(Stack, { gap: 5 }, [0, 1, 2].map((row) => h(Skeleton, { key: row, width: row === 1 ? '1/4' : '1/3' }))));
    }
    if (state.status === 'failed') {
      return h(EmptyState, {
        title: 'The log could not be read',
        description: state.message,
        action: h(Button, { variant: 'secondary', onPress: load }, 'Try again'),
      });
    }
    if (state.items.length === 0) {
      return h(EmptyState, { title: 'Nothing published yet', description: 'Publish an entry and it will be listed here, newest first.' });
    }
    return h(
      Stack,
      { gap: 4 },
      h(Inline, { justify: 'end' }, h(Button, { variant: 'secondary', size: 'sm', onPress: load }, 'Refresh')),
      h(Table, {
        label: 'Publish log',
        columns: [
          { id: 'what', label: 'Published' },
          { id: 'type', label: 'Type' },
          { id: 'when', label: 'When', align: 'end' },
        ],
        rows: state.items.map((item, index) => ({
          id: `${item.at}-${index}`,
          cells: {
            what: h(Text, { weight: 'semibold' }, `${item.slug} (${item.locale})`),
            type: h(Text, { size: 'sm', tone: 'muted' }, item.type),
            when: h(Text, { size: 'sm', tone: 'muted' }, new Date(item.at).toLocaleString()),
          },
        })),
      }),
    );
  }

  register.screen({ id: 'log', label: 'Publish log', description: 'What was published on this site, newest first.', Component: PublishLogScreen });
}
