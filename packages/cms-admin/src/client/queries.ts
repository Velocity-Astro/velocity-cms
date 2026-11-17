import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EntryListQuery } from './admin-client.js';
import { useClient } from './client-context.js';

/**
 * Every request the screens make, in one place, so each has one cache key and screens never
 * call the client directly.
 */
const keys = {
  session: ['session'] as const,
  contentTypes: ['content-types'] as const,
  entries: (query: EntryListQuery) => ['entries', query] as const,
};

export function useSession() {
  const client = useClient();
  return useQuery({ queryKey: keys.session, queryFn: () => client.getSession() });
}

export function useContentTypes() {
  const client = useClient();
  return useQuery({ queryKey: keys.contentTypes, queryFn: () => client.listContentTypes() });
}

export function useEntries(query: EntryListQuery) {
  const client = useClient();
  return useQuery({ queryKey: keys.entries(query), queryFn: () => client.listEntries(query) });
}

export function useRequestSignInLink() {
  const client = useClient();
  return useMutation({ mutationFn: (email: string) => client.requestSignInLink(email) });
}

export function useSignInWithPasskey() {
  const client = useClient();
  const cache = useQueryClient();
  return useMutation({
    mutationFn: () => client.signInWithPasskey(),
    onSuccess: (user) => cache.setQueryData(keys.session, user),
  });
}

export function useSignOut() {
  const client = useClient();
  const cache = useQueryClient();
  return useMutation({
    mutationFn: () => client.signOut(),
    // Nothing the last person loaded may be shown to the next.
    onSuccess: () => {
      cache.clear();
      cache.setQueryData(keys.session, null);
    },
  });
}
