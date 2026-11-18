import { MutationCache, QueryCache, QueryClient, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Entry } from '@velocity/cms-core';
import type { EntryChanges, EntryListQuery, NewEntry } from './admin-client.js';
import { AdminRequestError } from './errors.js';
import { useClient } from './client-context.js';

/**
 * Every request the screens make, in one place, so each has one cache key and screens never
 * call the client directly.
 */
const keys = {
  session: ['session'] as const,
  contentTypes: ['content-types'] as const,
  fieldTypes: ['field-types'] as const,
  images: ['images'] as const,
  /** Every list of entries starts with this, so one call marks them all out of date. */
  entryLists: ['entries'] as const,
  entries: (query: EntryListQuery) => ['entries', query] as const,
  entry: (id: string) => ['entry', id] as const,
};

/**
 * The cache every request goes through, one per app. When the server answers any request with
 * "sign in first" (the session ended, or was ended elsewhere), the app learns that nobody is
 * signed in, and the frame shows the sign-in screen.
 */
export function createQueryCache(): QueryClient {
  const signedOut = (error: unknown) => {
    if (error instanceof AdminRequestError && error.code === 'unauthenticated') client.setQueryData(keys.session, null);
  };
  const client = new QueryClient({
    queryCache: new QueryCache({ onError: signedOut }),
    mutationCache: new MutationCache({ onError: signedOut }),
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
  return client;
}

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

/** The entries of several content types at once, one request each, sharing the lists' cache. */
export function useEntriesOfTypes(queries: readonly EntryListQuery[]) {
  const client = useClient();
  return useQueries({
    queries: queries.map((query) => ({ queryKey: keys.entries(query), queryFn: () => client.listEntries(query) })),
  });
}

/** Field types change only when the site is redeployed, so they are fetched once. */
export function useFieldTypes() {
  const client = useClient();
  return useQuery({ queryKey: keys.fieldTypes, queryFn: () => client.listFieldTypes(), staleTime: Infinity });
}

/** The site's images change only when the site is redeployed, so they are fetched once. */
export function useImages() {
  const client = useClient();
  return useQuery({ queryKey: keys.images, queryFn: () => client.listImages(), staleTime: Infinity });
}

/** One entry. Not fetched while `id` is `null`, which is how a new entry's screen asks. */
export function useEntry(id: string | null) {
  const client = useClient();
  return useQuery({
    queryKey: keys.entry(id ?? ''),
    queryFn: () => client.getEntry(id ?? ''),
    enabled: id !== null,
  });
}

/** What every change to an entry does afterwards: show the new version and refresh the lists. */
function useEntryChanged() {
  const cache = useQueryClient();
  return (entry: Entry) => {
    cache.setQueryData(keys.entry(entry.id), entry);
    void cache.invalidateQueries({ queryKey: keys.entryLists });
  };
}

export function useCreateEntry() {
  const client = useClient();
  return useMutation({ mutationFn: (entry: NewEntry) => client.createEntry(entry), onSuccess: useEntryChanged() });
}

export function useUpdateEntry() {
  const client = useClient();
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: EntryChanges }) => client.updateEntry(id, changes),
    onSuccess: useEntryChanged(),
  });
}

export function usePublishEntry() {
  const client = useClient();
  return useMutation({
    mutationFn: ({ id, expectedRevision }: { id: string; expectedRevision: number }) => client.publishEntry(id, expectedRevision),
    onSuccess: useEntryChanged(),
  });
}

export function useUnpublishEntry() {
  const client = useClient();
  return useMutation({ mutationFn: (id: string) => client.unpublishEntry(id), onSuccess: useEntryChanged() });
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
