import { Box, Button, EmptyState, Spinner } from '@velocity/cms-ui';
import { CircleAlert } from 'lucide-react';
import { useMessages } from '../messages/messages-context.js';

export interface LoadingStateProps {
  /** What is being fetched, such as "Loading listings". Defaults to "Loading". */
  readonly label?: string;
}

/** What a screen shows while its content is on the way. */
export function LoadingState({ label }: LoadingStateProps) {
  const messages = useMessages();
  return (
    <Box padding={8}>
      <Spinner label={label ?? messages.app.loading} showLabel />
    </Box>
  );
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
