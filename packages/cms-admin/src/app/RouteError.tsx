import { isRouteErrorResponse, useRouteError } from 'react-router';
import { useMessages } from '../messages/messages-context.js';
import { ErrorState } from './RequestState.js';

/**
 * What a screen shows when it could not be drawn, in place of the router's own page: what went
 * wrong, and a way to try again, which loads the editor afresh. Inside the frame, so the way to
 * every other screen stays.
 */
export function RouteError({ isNotFound = false }: { readonly isNotFound?: boolean }) {
  const messages = useMessages();
  const error = useRouteError();
  const shown = isNotFound || (isRouteErrorResponse(error) && error.status === 404) ? new Error(messages.app.screenNotFound) : error instanceof Error ? error : new Error(messages.app.screenFailed);
  return <ErrorState error={shown} onRetry={() => window.location.reload()} />;
}
