import { EmptyState } from '@velocity/cms-ui';
import { Shapes } from 'lucide-react';
import { Navigate } from 'react-router';
import { paths } from '../../app/paths.js';
import { ErrorState, LoadingState } from '../../app/RequestState.js';
import { useContentTypes } from '../../client/queries.js';
import { useMessages } from '../../messages/messages-context.js';

/** Where the editor opens: the first content type, or a word on what to do when there are none. */
export function HomeScreen() {
  const messages = useMessages();
  const types = useContentTypes();

  if (types.isPending) return <LoadingState />;
  if (types.isError) return <ErrorState error={types.error} onRetry={() => void types.refetch()} />;

  const first = types.data[0];
  if (first) return <Navigate to={paths.contentList(first.key)} replace />;
  return <EmptyState icon={Shapes} title={messages.contentList.noTypesTitle} description={messages.contentList.noTypesDescription} />;
}
