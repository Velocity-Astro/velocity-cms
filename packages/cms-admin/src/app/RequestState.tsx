import { Box, Button, Card, EmptyState, Grid, Inline, Skeleton, SkeletonGroup, Spinner, Stack } from '@velocity-astro/cms-ui';
import type { ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { useMessages } from '../messages/messages-context.js';

/**
 * What a screen is waiting for, which decides the shapes it shows meanwhile: a whole screen with
 * its heading and a list, a list alone, an entry's form, or the numbers and list of the home
 * screen. `spinner` is for before there is any layout to keep.
 */
export type LoadingShape = 'page' | 'table' | 'form' | 'summary' | 'spinner';

export interface LoadingStateProps {
  /** What is being fetched, such as "Loading listings". Defaults to "Loading". */
  readonly label?: string;
  readonly shape?: LoadingShape;
}

const ROWS = [0, 1, 2, 3, 4];

/** A list of things on the way: rows with a name, a line under it and two short columns. */
function TableShape() {
  return (
    <Card>
      <Stack gap={5}>
        {ROWS.map((row) => (
          <Inline key={row} gap={6}>
            <Box grow>
              <Stack gap={2}>
                <Skeleton width={row % 2 === 0 ? '1/3' : '1/4'} />
                <Skeleton width="xs" />
              </Stack>
            </Box>
            <Skeleton width="sm" />
            <Skeleton width="sm" />
          </Inline>
        ))}
      </Stack>
    </Card>
  );
}

function HeadingShape() {
  return (
    <Stack gap={3}>
      <Skeleton shape="title" width="1/4" />
      <Skeleton width="1/3" />
    </Stack>
  );
}

const SHAPES: Readonly<Record<Exclude<LoadingShape, 'spinner'>, () => ReactNode>> = {
  table: () => <TableShape />,
  page: () => (
    <Box paddingX={12} paddingY={10}>
      <Stack gap={6}>
        <HeadingShape />
        <TableShape />
      </Stack>
    </Box>
  ),
  summary: () => (
    <Stack gap={6}>
      <Grid columns={3} gap={4}>
        {[0, 1, 2].map((card) => (
          <Card key={card}>
            <Stack gap={3}>
              <Skeleton width="1/2" />
              <Skeleton shape="title" width="1/4" />
              <Skeleton width="3/4" />
            </Stack>
          </Card>
        ))}
      </Grid>
      <TableShape />
    </Stack>
  ),
  form: () => (
    <Box paddingX={12} paddingY={8}>
      <Stack gap={6}>
        <HeadingShape />
        <Card>
          <Stack gap={5}>
            {[0, 1, 2].map((field) => (
              <Stack key={field} gap={2}>
                <Skeleton width="sm" />
                <Skeleton shape="control" />
              </Stack>
            ))}
            <Stack gap={2}>
              <Skeleton width="sm" />
              <Skeleton shape="block" />
            </Stack>
          </Stack>
        </Card>
      </Stack>
    </Box>
  ),
};

/** What a screen shows while its content is on the way: grey shapes laid out like the content. */
export function LoadingState({ label, shape = 'page' }: LoadingStateProps) {
  const messages = useMessages();
  const words = label ?? messages.app.loading;
  if (shape === 'spinner') {
    return (
      <Box padding={8}>
        <Spinner label={words} showLabel />
      </Box>
    );
  }
  return <SkeletonGroup label={words}>{SHAPES[shape]()}</SkeletonGroup>;
}

export interface ErrorStateProps {
  readonly error: Error;
  readonly onRetry: () => void;
}

/** What a screen shows when its content could not be fetched: what went wrong, and a way to try again. */
export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const messages = useMessages();
  return (
    <EmptyState
      icon={CircleAlert}
      title={messages.app.somethingWentWrong}
      description={error.message}
      action={
        <Button variant="secondary" onPress={onRetry}>
          {messages.app.tryAgain}
        </Button>
      }
    />
  );
}
