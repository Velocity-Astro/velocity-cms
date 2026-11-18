import { MutationCache, QueryCache, QueryClient, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContentTypeChanges, EntryData, ContentTypeDef, Entry, FieldArrangement, FieldChanges, FieldSection, NewUpload, Role } from '@velocity/cms-core';
import type { EntryChanges, EntryListQuery, ImageList, NewEntry, NewPerson, NewType, NewTypeField } from './admin-client.js';
import { AdminRequestError } from './errors.js';
import { useClient } from './client-context.js';

/**
 * Every request the screens make, in one place, so each has one cache key and screens never
 * call the client directly.
 */
const keys = {
  session: ['session'] as const,
  contentTypes: ['content-types'] as const,
  archivedContentTypes: ['archived-content-types'] as const,
  fieldTypes: ['field-types'] as const,
  images: ['images'] as const,
  people: ['people'] as const,
  passkeys: ['passkeys'] as const,
  plugins: ['plugins'] as const,
  pluginSettings: (name: string) => ['plugins', name, 'settings'] as const,
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

/** What every change to a content type does afterwards: show the new version everywhere, without asking again. */
function useTypeChanged() {
  const cache = useQueryClient();
  return (type: ContentTypeDef) => {
    cache.setQueryData<readonly ContentTypeDef[]>(keys.contentTypes, (types) =>
      types ? [...types.filter((existing) => existing.id !== type.id), type].sort((a, b) => a.key.localeCompare(b.key)) : types,
    );
    // A list of entries shows a type's fields as columns.
    void cache.invalidateQueries({ queryKey: keys.entryLists });
  };
}

export function useCreateContentType() {
  const client = useClient();
  return useMutation({ mutationFn: (type: NewType) => client.createContentType(type), onSuccess: useTypeChanged() });
}

/** The archived content types. Asked for only where they are shown. */
export function useArchivedContentTypes() {
  const client = useClient();
  return useQuery({ queryKey: keys.archivedContentTypes, queryFn: () => client.listArchivedContentTypes() });
}

/** What archiving and restoring do afterwards: the type moves between the two lists, and its entries with it. */
function useTypeMoved() {
  const cache = useQueryClient();
  return () => {
    void cache.invalidateQueries({ queryKey: keys.contentTypes });
    void cache.invalidateQueries({ queryKey: keys.archivedContentTypes });
    void cache.invalidateQueries({ queryKey: keys.entryLists });
  };
}

export function useArchiveContentType() {
  const client = useClient();
  return useMutation({ mutationFn: (id: string) => client.archiveContentType(id), onSuccess: useTypeMoved() });
}

export function useRestoreContentType() {
  const client = useClient();
  return useMutation({ mutationFn: (id: string) => client.restoreContentType(id), onSuccess: useTypeMoved() });
}

export function useUpdateContentType() {
  const client = useClient();
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: ContentTypeChanges }) => client.updateContentType(id, changes),
    onSuccess: useTypeChanged(),
  });
}

export function useAddField() {
  const client = useClient();
  return useMutation({
    mutationFn: ({ typeId, field, within }: { typeId: string; field: NewTypeField; within?: readonly string[] }) => client.addField(typeId, field, within),
    onSuccess: useTypeChanged(),
  });
}

/** Changes a field and, when `arrangement` says so, where it is shown: one action to the person. */
export function useChangeField() {
  const client = useClient();
  return useMutation({
    mutationFn: async ({ typeId, fieldId, changes, arrangement, within }: { typeId: string; fieldId: string; changes: FieldChanges; arrangement?: FieldArrangement; within?: readonly string[] }) => {
      const changed = await client.changeField(typeId, fieldId, changes, within);
      return arrangement ? client.arrangeFields(typeId, arrangement) : changed;
    },
    onSuccess: useTypeChanged(),
  });
}

export function useRemoveField() {
  const client = useClient();
  return useMutation({
    mutationFn: ({ typeId, fieldId, within }: { typeId: string; fieldId: string; within?: readonly string[] }) => client.removeField(typeId, fieldId, within),
    onSuccess: useTypeChanged(),
  });
}

export function useRestoreField() {
  const client = useClient();
  return useMutation({
    mutationFn: ({ typeId, fieldId, within }: { typeId: string; fieldId: string; within?: readonly string[] }) => client.restoreField(typeId, fieldId, within),
    onSuccess: useTypeChanged(),
  });
}

export function useSetSections() {
  const client = useClient();
  return useMutation({
    mutationFn: ({ typeId, sections }: { typeId: string; sections: readonly FieldSection[] }) => client.setSections(typeId, sections),
    onSuccess: useTypeChanged(),
  });
}

export function useArrangeFields() {
  const client = useClient();
  return useMutation({
    mutationFn: ({ typeId, arrangement }: { typeId: string; arrangement: FieldArrangement }) => client.arrangeFields(typeId, arrangement),
    onSuccess: useTypeChanged(),
  });
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

/** The site's images change only when someone here uploads one, so they are fetched once. */
export function useImages() {
  const client = useClient();
  return useQuery({ queryKey: keys.images, queryFn: () => client.listImages(), staleTime: Infinity, select: (list) => list.items });
}

/** Whether the site takes uploads, and how large one may be. `null` when it takes none. */
export function useUploadRules() {
  const client = useClient();
  return useQuery({ queryKey: keys.images, queryFn: () => client.listImages(), staleTime: Infinity, select: (list) => list.upload });
}

/** Adds an image, which then shows among the others without asking the server again. */
export function useRemoveImage() {
  const client = useClient();
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => client.removeImage(name),
    onSuccess: (_nothing, name) => {
      cache.setQueryData<ImageList>(keys.images, (list) => (list ? { ...list, items: list.items.filter((image) => image.name !== name) } : list));
    },
  });
}

export function useUploadImage() {
  const client = useClient();
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (upload: NewUpload) => client.uploadImage(upload),
    onSuccess: (image) => {
      cache.setQueryData<ImageList>(keys.images, (list) =>
        list ? { ...list, items: [...list.items, image].sort((a, b) => a.name.localeCompare(b.name)) } : list,
      );
    },
  });
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

/** Asks for a link each time: a link runs out, so it is never kept. */
export function usePreviewEntry() {
  const client = useClient();
  return useMutation({ mutationFn: (id: string) => client.previewEntry(id) });
}

export function usePeople() {
  const client = useClient();
  return useQuery({ queryKey: keys.people, queryFn: () => client.listPeople() });
}

/** What every change to who can sign in does afterwards: read the list again. */
function usePeopleChanged() {
  const cache = useQueryClient();
  return () => void cache.invalidateQueries({ queryKey: keys.people });
}

export function useInvitePerson() {
  const client = useClient();
  return useMutation({ mutationFn: (person: NewPerson) => client.invitePerson(person), onSuccess: usePeopleChanged() });
}

export function useChangePersonRole() {
  const client = useClient();
  return useMutation({ mutationFn: ({ id, role }: { id: string; role: Role }) => client.changePersonRole(id, role), onSuccess: usePeopleChanged() });
}

export function useRemovePerson() {
  const client = useClient();
  return useMutation({ mutationFn: (id: string) => client.removePerson(id), onSuccess: usePeopleChanged() });
}

export function usePlugins() {
  const client = useClient();
  return useQuery({ queryKey: keys.plugins, queryFn: () => client.listPlugins() });
}

export function useSetPluginEnabled() {
  const client = useClient();
  const cache = useQueryClient();
  return useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) => client.setPluginEnabled(name, enabled),
    // A plugin switched on can bring field types and checks with it, so what was read before may be out of date.
    onSuccess: () => void cache.invalidateQueries(),
  });
}

export function usePluginSettings(name: string) {
  const client = useClient();
  return useQuery({ queryKey: keys.pluginSettings(name), queryFn: () => client.getPluginSettings(name) });
}

export function useSavePluginSettings(name: string) {
  const client = useClient();
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (values: EntryData) => client.savePluginSettings(name, values),
    onSuccess: (saved) => cache.setQueryData(keys.pluginSettings(name), saved),
  });
}

/** The signed-in person's own passkeys. Asked for only while their window is open. */
export function usePasskeys() {
  const client = useClient();
  return useQuery({ queryKey: keys.passkeys, queryFn: () => client.listPasskeys() });
}

function usePasskeysChanged() {
  const cache = useQueryClient();
  return () => void cache.invalidateQueries({ queryKey: keys.passkeys });
}

export function useAddPasskey() {
  const client = useClient();
  return useMutation({ mutationFn: (name: string) => client.addPasskey(name), onSuccess: usePasskeysChanged() });
}

export function useRemovePasskey() {
  const client = useClient();
  return useMutation({ mutationFn: (id: string) => client.removePasskey(id), onSuccess: usePasskeysChanged() });
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
