import { MutationCache, QueryCache, QueryClient, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FormsSettingsChanges, GeneralSettingsChanges, EmailSettingsChanges, StorageSettingsChanges, ContactImportReport, ContactImportRow, ContentTypeChanges, EntryData, ContentTypeDef, Entry, FieldArrangement, FieldChanges, FieldSection, Contact, ContactChanges, DealChanges, NewDeal, Page, PipelineChanges, CustomFieldsChanges, FormChanges, FormDef, NewContact, NewForm, NewUpload, Role, SubmissionStatus } from '@velocity-astro/cms-core';
import type { ContactListQuery, DealListQuery, EntryChanges, EntryListQuery, ImageList, NewAccessToken, NewEntry, NewPerson, NewType, NewTypeField, SubmissionListQuery } from './admin-client.js';
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
  tokens: ['tokens'] as const,
  passkeys: ['passkeys'] as const,
  plugins: ['plugins'] as const,
  pluginEditors: ['plugin-editors'] as const,
  pluginSettings: (name: string) => ['plugins', name, 'settings'] as const,
  pluginTasks: (name: string) => ['plugins', name, 'tasks'] as const,
  /** Every list of entries starts with this, so one call marks them all out of date. */
  entryLists: ['entries'] as const,
  trash: ['entries', 'trash'] as const,
  entries: (query: EntryListQuery) => ['entries', query] as const,
  entry: (id: string) => ['entry', id] as const,
  forms: ['forms'] as const,
  trashedForms: ['forms', 'trash'] as const,
  /** Everything about what forms were sent starts with this, so one call marks it all out of date. */
  submissions: ['submissions'] as const,
  submissionList: (query: SubmissionListQuery) => ['submissions', 'list', query] as const,
  submissionCounts: (formId: string) => ['submissions', 'counts', formId] as const,
  /** Everything about contacts starts with this, so one call marks it all out of date. */
  contacts: ['contacts'] as const,
  contactList: (query: ContactListQuery) => ['contacts', 'list', query] as const,
  contact: (id: string) => ['contacts', 'one', id] as const,
  contactTimeline: (id: string) => ['contacts', 'timeline', id] as const,
  pipeline: ['contacts', 'pipeline'] as const,
  customFields: ['contacts', 'custom-fields'] as const,
  /** Everything about deals starts with this. A change to contacts or the pipeline marks it out of date too. */
  deals: ['contacts', 'deals'] as const,
  dealList: (query: DealListQuery) => ['contacts', 'deals', 'list', query] as const,
  forecast: ['contacts', 'deals', 'forecast'] as const,
  team: ['team'] as const,
  emailSettings: ['settings', 'email'] as const,
  storageSettings: ['settings', 'storage'] as const,
  formsSettings: ['settings', 'forms'] as const,
  generalSettings: ['settings', 'general'] as const,
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
    // A request is always tried, connection or not: one held back until the connection returns
    // shows a spinner with no end, where a failure says what happened and offers another try.
    defaultOptions: { queries: { retry: false, staleTime: 30_000, networkMode: 'always' }, mutations: { networkMode: 'always' } },
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

/** The most the server hands over in one answer. A list asked for with this limit is meant whole. */
const MOST = 200;
/** A stop for a list that never ends, far past what a screen can show. */
const WHOLE_STOPS_AT = 10_000;

/**
 * A list read to its end. A screen that asks for the most the server gives in one answer means
 * the whole list, so the answers that follow are read too: a list never stops short in silence.
 */
/** How many of each kind the search shows. */
export const FOUND_AT_MOST = 6;

async function whole<T, Q extends { readonly limit?: number; readonly offset?: number }>(query: Q, list: (query: Q) => Promise<Page<T>>): Promise<Page<T>> {
  const first = await list(query);
  if (query.limit !== MOST || query.offset !== undefined) return first;
  const items = [...first.items];
  while (items.length < first.total && items.length < WHOLE_STOPS_AT) {
    const next = await list({ ...query, offset: items.length });
    if (next.items.length === 0) break;
    items.push(...next.items);
  }
  return { items, total: first.total };
}

export function useEntries(query: EntryListQuery) {
  const client = useClient();
  return useQuery({ queryKey: keys.entries(query), queryFn: () => whole(query, (asked) => client.listEntries(asked)) });
}

/**
 * What the search finds of the site's content as it is typed: a few entries of any type, most
 * recently saved first. What was on screen stays while the next answer is on its way.
 */
export function useFoundEntries(words: string, isWanted: boolean) {
  const client = useClient();
  // Enough for each entry found to come with its other languages, so the editor's own is among them.
  const query: EntryListQuery = { search: words, limit: FOUND_AT_MOST * 4 };
  return useQuery({ queryKey: keys.entries(query), queryFn: () => client.listEntries(query), enabled: isWanted && words !== '', placeholderData: (previous) => previous });
}

/** The entries of several content types at once, one request each, sharing the lists' cache. */
export function useEntriesOfTypes(queries: readonly EntryListQuery[]) {
  const client = useClient();
  return useQueries({
    queries: queries.map((query) => ({ queryKey: keys.entries(query), queryFn: () => whole(query, (asked) => client.listEntries(asked)) })),
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
    // Every change is a new line in the entry's history.
    void cache.invalidateQueries({ queryKey: [...keys.entry(entry.id), 'history'] });
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
/** The entries in the trash. Kept with the lists, so whatever changes an entry refreshes it. */
export function useTrash() {
  const client = useClient();
  return useQuery({ queryKey: keys.trash, queryFn: () => whole({ limit: MOST }, (asked) => client.listTrash(asked)) });
}

export function useDuplicateEntry() {
  const client = useClient();
  return useMutation({ mutationFn: (id: string) => client.duplicateEntry(id), onSuccess: useEntryChanged() });
}

export function useScheduleEntry() {
  const client = useClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { readonly id: string; readonly at: string; readonly expectedRevision: number }) => client.scheduleEntry(id, input),
    onSuccess: useEntryChanged(),
  });
}

export function useUnscheduleEntry() {
  const client = useClient();
  return useMutation({ mutationFn: (id: string) => client.unscheduleEntry(id), onSuccess: useEntryChanged() });
}

/** Every save of an entry, the latest first. Asked for only once someone opens its history. */
export function useEntryHistory(id: string, isAsked = true) {
  const client = useClient();
  return useQuery({ queryKey: [...keys.entry(id), 'history'], queryFn: () => client.entryHistory(id), enabled: isAsked });
}

export function useRevertEntry() {
  const client = useClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { readonly id: string; readonly revision: number; readonly expectedRevision: number }) => client.revertEntry(id, input),
    onSuccess: useEntryChanged(),
  });
}

export function useTrashEntry() {
  const client = useClient();
  return useMutation({ mutationFn: (id: string) => client.trashEntry(id), onSuccess: useEntryChanged() });
}

export function useRestoreEntry() {
  const client = useClient();
  return useMutation({ mutationFn: (id: string) => client.restoreEntry(id), onSuccess: useEntryChanged() });
}

export function useDeleteEntry() {
  const client = useClient();
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.deleteEntry(id),
    onSuccess: (_, id) => {
      cache.removeQueries({ queryKey: keys.entry(id) });
      void cache.invalidateQueries({ queryKey: keys.entryLists });
    },
  });
}

export function useForms() {
  const client = useClient();
  return useQuery({ queryKey: keys.forms, queryFn: () => client.listForms() });
}

/** The forms in the trash. Asked for only where they are shown. */
export function useTrashedForms(isAsked = true) {
  const client = useClient();
  return useQuery({ queryKey: keys.trashedForms, queryFn: () => client.listTrashedForms(), enabled: isAsked });
}

/** What every change to a form does afterwards: show the new version everywhere, without asking again. */
function useFormChanged() {
  const cache = useQueryClient();
  return (form: FormDef) => {
    cache.setQueryData<readonly FormDef[]>(keys.forms, (forms) =>
      forms ? [...forms.filter((existing) => existing.id !== form.id), form].sort((a, b) => a.key.localeCompare(b.key)) : forms,
    );
  };
}

/** What moving a form to the trash, out of it or away for good does afterwards. */
function useFormMoved() {
  const cache = useQueryClient();
  return () => {
    void cache.invalidateQueries({ queryKey: keys.forms });
    void cache.invalidateQueries({ queryKey: keys.submissions });
  };
}

export function useCreateForm() {
  const client = useClient();
  return useMutation({ mutationFn: (form: NewForm) => client.createForm(form), onSuccess: useFormChanged() });
}

export function useUpdateForm() {
  const client = useClient();
  return useMutation({ mutationFn: ({ id, changes }: { id: string; changes: FormChanges }) => client.updateForm(id, changes), onSuccess: useFormChanged() });
}

export function useTrashForm() {
  const client = useClient();
  return useMutation({ mutationFn: (id: string) => client.trashForm(id), onSuccess: useFormMoved() });
}

export function useRestoreForm() {
  const client = useClient();
  return useMutation({ mutationFn: (id: string) => client.restoreForm(id), onSuccess: useFormMoved() });
}

export function useDeleteForm() {
  const client = useClient();
  return useMutation({ mutationFn: (id: string) => client.deleteForm(id), onSuccess: useFormMoved() });
}

/** What a form was sent. `isAsked` is false for someone who may not read submissions. */
export function useSubmissions(query: SubmissionListQuery, isAsked = true) {
  const client = useClient();
  return useQuery({ queryKey: keys.submissionList(query), queryFn: () => whole(query, (asked) => client.listSubmissions(asked)), enabled: isAsked });
}

export function useSubmissionCounts(formId: string, isAsked = true) {
  const client = useClient();
  return useQuery({ queryKey: keys.submissionCounts(formId), queryFn: () => client.countSubmissions(formId), enabled: isAsked });
}

/** The counts of several forms at once, in the order asked, for a list of forms. */
export function useSubmissionCountsOf(formIds: readonly string[], isAsked = true) {
  const client = useClient();
  return useQueries({ queries: formIds.map((formId) => ({ queryKey: keys.submissionCounts(formId), queryFn: () => client.countSubmissions(formId), enabled: isAsked })) });
}

/** Every submission of each form, read to the end, asked for together: what Home counts by day. For those who may read them. */
export function useSubmissionLists(formIds: readonly string[], isAsked = true) {
  const client = useClient();
  return useQueries({
    queries: formIds.map((formId) => {
      const query: SubmissionListQuery = { formId, limit: MOST };
      return { queryKey: keys.submissionList(query), queryFn: () => whole(query, (asked) => client.listSubmissions(asked)), enabled: isAsked };
    }),
  });
}

/** What every change to a submission does afterwards: the lists and the counts are asked for again. */
function useSubmissionsChanged() {
  const cache = useQueryClient();
  return () => void cache.invalidateQueries({ queryKey: keys.submissions });
}

export function useMarkSubmission() {
  const client = useClient();
  return useMutation({ mutationFn: ({ id, status }: { id: string; status: SubmissionStatus }) => client.markSubmission(id, status), onSuccess: useSubmissionsChanged() });
}

export function useDeleteSubmission() {
  const client = useClient();
  return useMutation({ mutationFn: (id: string) => client.deleteSubmission(id), onSuccess: useSubmissionsChanged() });
}

/** Asks for the file each time it is wanted: it is never kept. */
export function useExportSubmissions() {
  const client = useClient();
  return useMutation({ mutationFn: (formId: string) => client.exportSubmissions(formId) });
}

export function useForgetSender() {
  const client = useClient();
  const cache = useQueryClient();
  const changed = useSubmissionsChanged();
  return useMutation({
    mutationFn: (email: string) => client.forgetSender(email),
    onSuccess: () => {
      changed();
      // Their contact went with what they sent.
      void cache.invalidateQueries({ queryKey: keys.contacts });
    },
  });
}

/** The people who wrote to the site. What was on screen stays while the next search is on its way. */
export function useContacts(query: ContactListQuery = {}) {
  const client = useClient();
  return useQuery({ queryKey: keys.contactList(query), queryFn: () => whole(query, (asked) => client.listContacts(asked)), placeholderData: (previous) => previous });
}

/** What the search finds of the people who wrote to the site as it is typed: a few contacts. */
export function useFoundContacts(words: string, isWanted: boolean) {
  const client = useClient();
  const query: ContactListQuery = { search: words, limit: FOUND_AT_MOST };
  return useQuery({ queryKey: keys.contactList(query), queryFn: () => client.listContacts(query), enabled: isWanted && words !== '', placeholderData: (previous) => previous });
}

/** One list of contacts per query, asked for together: the columns of the board. */
export function useContactLists(queries: readonly ContactListQuery[]) {
  const client = useClient();
  return useQueries({
    queries: queries.map((query) => ({ queryKey: keys.contactList(query), queryFn: () => client.listContacts(query), placeholderData: (previous: Page<Contact> | undefined) => previous })),
  });
}

/**
 * Puts a contact in another stage. It stays pending until the lists have been asked for again,
 * so the board can show the card where it was put for as long as the lists still say otherwise.
 */
export function useMoveContact() {
  const client = useClient();
  const cache = useQueryClient();
  return useMutation({
    mutationFn: ({ contact, stage }: { contact: Contact; stage: string }) => client.updateContact(contact.id, { stage, expectedRevision: contact.revision }),
    onSettled: () => cache.invalidateQueries({ queryKey: keys.contacts }),
  });
}

export function useDeals(query: DealListQuery = {}) {
  const client = useClient();
  return useQuery({ queryKey: keys.dealList(query), queryFn: () => whole(query, (asked) => client.listDeals(asked)), placeholderData: (previous) => previous });
}

/** One list of deals per query, asked for together: the columns of the board. */
export function useDealLists(queries: readonly DealListQuery[]) {
  const client = useClient();
  return useQueries({ queries: queries.map((query) => ({ queryKey: keys.dealList(query), queryFn: () => client.listDeals(query) })) });
}

/** Every deal of each stage, read to the end, asked for together: the won deals a monthly target is measured by. */
export function useWholeDealLists(stages: readonly string[]) {
  const client = useClient();
  return useQueries({
    queries: stages.map((stage) => {
      const query: DealListQuery = { stage, limit: MOST };
      return { queryKey: keys.dealList(query), queryFn: () => whole(query, (asked) => client.listDeals(asked)) };
    }),
  });
}

export function useForecast() {
  const client = useClient();
  return useQuery({ queryKey: keys.forecast, queryFn: () => client.getForecast() });
}

/** What every change to a deal does afterwards. It is awaited, so a change stays pending until the lists are fresh. */
function useDealsChanged() {
  const cache = useQueryClient();
  return () => cache.invalidateQueries({ queryKey: keys.deals });
}

export function useCreateDeal() {
  const client = useClient();
  return useMutation({ mutationFn: (input: NewDeal) => client.createDeal(input), onSettled: useDealsChanged() });
}

export function useUpdateDeal() {
  const client = useClient();
  return useMutation({ mutationFn: ({ id, changes }: { id: string; changes: DealChanges }) => client.updateDeal(id, changes), onSettled: useDealsChanged() });
}

export function useDeleteDeal() {
  const client = useClient();
  return useMutation({ mutationFn: (id: string) => client.deleteDeal(id), onSettled: useDealsChanged() });
}

/** How the site's email is sent. Owners only. */
export function useEmailSettings() {
  const client = useClient();
  return useQuery({ queryKey: keys.emailSettings, queryFn: () => client.getEmailSettings() });
}

export function useSaveEmailSettings() {
  const client = useClient();
  const cache = useQueryClient();
  return useMutation({ mutationFn: (changes: EmailSettingsChanges) => client.saveEmailSettings(changes), onSuccess: (saved) => cache.setQueryData(keys.emailSettings, saved) });
}

export function useSendTestEmail() {
  const client = useClient();
  return useMutation({ mutationFn: () => client.sendTestEmail() });
}

/** The site's basics. Owners only. */
export function useGeneralSettings() {
  const client = useClient();
  return useQuery({ queryKey: keys.generalSettings, queryFn: () => client.getGeneralSettings() });
}

export function useSaveGeneralSettings() {
  const client = useClient();
  const cache = useQueryClient();
  return useMutation({ mutationFn: (changes: GeneralSettingsChanges) => client.saveGeneralSettings(changes), onSuccess: (saved) => cache.setQueryData(keys.generalSettings, saved) });
}

/** How the site's forms are guarded. Owners only. */
export function useFormsSettings() {
  const client = useClient();
  return useQuery({ queryKey: keys.formsSettings, queryFn: () => client.getFormsSettings() });
}

export function useSaveFormsSettings() {
  const client = useClient();
  const cache = useQueryClient();
  return useMutation({ mutationFn: (changes: FormsSettingsChanges) => client.saveFormsSettings(changes), onSuccess: (saved) => cache.setQueryData(keys.formsSettings, saved) });
}

export function useTestFormsSettings() {
  const client = useClient();
  return useMutation({ mutationFn: () => client.testFormsSettings() });
}

/** Where the site's uploads are kept. Owners only. */
export function useStorageSettings() {
  const client = useClient();
  return useQuery({ queryKey: keys.storageSettings, queryFn: () => client.getStorageSettings() });
}

export function useSaveStorageSettings() {
  const client = useClient();
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (changes: StorageSettingsChanges) => client.saveStorageSettings(changes),
    onSuccess: (saved) => {
      cache.setQueryData(keys.storageSettings, saved);
      // Whether the site takes uploads may have changed with it.
      void cache.invalidateQueries({ queryKey: keys.images });
    },
  });
}

export function useTestStorage() {
  const client = useClient();
  return useMutation({ mutationFn: () => client.testStorage() });
}

/** The stages a contact moves through. */
export function usePipeline() {
  const client = useClient();
  return useQuery({ queryKey: keys.pipeline, queryFn: () => client.getPipeline() });
}

export function useSavePipeline() {
  const client = useClient();
  return useMutation({ mutationFn: (changes: PipelineChanges) => client.savePipeline(changes), onSuccess: useContactsChanged() });
}

/** The fields this site adds to its contacts and deals. */
export function useCustomFields() {
  const client = useClient();
  return useQuery({ queryKey: keys.customFields, queryFn: () => client.getCustomFields() });
}

export function useSaveCustomFields() {
  const client = useClient();
  const cache = useQueryClient();
  return useMutation({ mutationFn: (changes: CustomFieldsChanges) => client.saveCustomFields(changes), onSuccess: (saved) => cache.setQueryData(keys.customFields, saved) });
}

/** Who a contact can be given to. */
export function useTeam() {
  const client = useClient();
  return useQuery({ queryKey: keys.team, queryFn: () => client.listTeam() });
}

export function useContact(id: string) {
  const client = useClient();
  return useQuery({ queryKey: keys.contact(id), queryFn: () => client.getContact(id) });
}

export function useContactTimeline(id: string) {
  const client = useClient();
  return useQuery({ queryKey: keys.contactTimeline(id), queryFn: () => client.contactTimeline(id) });
}

/** What every change to a contact does afterwards: the lists, the contact and its timeline are asked for again. */
function useContactsChanged() {
  const cache = useQueryClient();
  return () => void cache.invalidateQueries({ queryKey: keys.contacts });
}

export function useCreateContact() {
  const client = useClient();
  return useMutation({ mutationFn: (input: NewContact) => client.createContact(input), onSuccess: useContactsChanged() });
}

/** How many rows of a file go in one request: few enough that each is answered soon. */
const IMPORT_PART = 50;

/**
 * Adds the contacts of a file, a part at a time, and answers with what became of all its rows.
 * A problem is given by the row's place in the whole file. If a part fails, the parts before it
 * are in, and the lists are read again all the same.
 */
export function useImportContacts() {
  const client = useClient();
  const changed = useContactsChanged();
  return useMutation({
    mutationFn: async (rows: readonly ContactImportRow[]): Promise<ContactImportReport> => {
      const whole = { added: 0, filled: 0, unchanged: 0, problems: [] as { row: number; message: string }[] };
      for (let start = 0; start < rows.length; start += IMPORT_PART) {
        const part = await client.importContacts(rows.slice(start, start + IMPORT_PART));
        whole.added += part.added;
        whole.filled += part.filled;
        whole.unchanged += part.unchanged;
        whole.problems.push(...part.problems.map((problem) => ({ ...problem, row: problem.row + start })));
      }
      return whole;
    },
    onSettled: changed,
  });
}

export function useUpdateContact() {
  const client = useClient();
  return useMutation({ mutationFn: ({ id, changes }: { id: string; changes: ContactChanges }) => client.updateContact(id, changes), onSuccess: useContactsChanged() });
}

export function useEraseContact() {
  const client = useClient();
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.eraseContact(id),
    onSuccess: (_, id) => {
      cache.removeQueries({ queryKey: keys.contact(id) });
      cache.removeQueries({ queryKey: keys.contactTimeline(id) });
      void cache.invalidateQueries({ queryKey: keys.contactList({}).slice(0, 2) });
      // What they sent went with them.
      void cache.invalidateQueries({ queryKey: keys.submissions });
    },
  });
}

export function useAddContactNote() {
  const client = useClient();
  return useMutation({ mutationFn: ({ id, text }: { id: string; text: string }) => client.addContactNote(id, text), onSuccess: useContactsChanged() });
}

export function useDeleteContactNote() {
  const client = useClient();
  return useMutation({ mutationFn: ({ id, noteId }: { id: string; noteId: string }) => client.deleteContactNote(id, noteId), onSuccess: useContactsChanged() });
}

/** Asks for the file each time it is wanted: it is never kept. */
export function useExportContact() {
  const client = useClient();
  return useMutation({ mutationFn: (id: string) => client.exportContact(id) });
}

export function usePreviewEntry() {
  const client = useClient();
  return useMutation({ mutationFn: (id: string) => client.previewEntry(id) });
}

/** How long a link for the page beside the form is used before a new one is asked for. A link lasts an hour. */
const PREVIEW_REFRESH = 30 * 60_000;

/**
 * A link to the entry's page for the frame beside its form, asked for again well before it runs
 * out. `saved` is the entry's revision: a save may have changed the page's address.
 */
export function usePagePreview(id: string | undefined, saved: number | undefined) {
  const client = useClient();
  return useQuery({
    queryKey: ['page-preview', id, saved] as const,
    queryFn: () => client.previewEntry(id ?? ''),
    enabled: id !== undefined,
    // The link in use stays while the next is on its way, so the page is never taken away over a save.
    placeholderData: (previous) => previous,
    staleTime: PREVIEW_REFRESH,
    refetchInterval: PREVIEW_REFRESH,
    retry: false,
  });
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

export function useTokens() {
  const client = useClient();
  return useQuery({ queryKey: keys.tokens, queryFn: () => client.listTokens() });
}

/** What every change to the access tokens does afterwards: read the list again. */
function useTokensChanged() {
  const cache = useQueryClient();
  return () => void cache.invalidateQueries({ queryKey: keys.tokens });
}

export function useCreateToken() {
  const client = useClient();
  return useMutation({ mutationFn: (token: NewAccessToken) => client.createToken(token), onSuccess: useTokensChanged() });
}

export function useRevokeToken() {
  const client = useClient();
  return useMutation({ mutationFn: (id: string) => client.revokeToken(id), onSuccess: useTokensChanged() });
}

export function usePlugins() {
  const client = useClient();
  return useQuery({ queryKey: keys.plugins, queryFn: () => client.listPlugins() });
}

/** The running plugins that add to the editor. Asked once someone is signed in. */
export function usePluginEditorList(isSignedIn: boolean) {
  const client = useClient();
  return useQuery({ queryKey: keys.pluginEditors, queryFn: () => client.listPluginEditors(), enabled: isSignedIn });
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

/** Saves or removes one of a plugin's keys or passwords. */
export function useSetPluginSecret(name: string) {
  const client = useClient();
  const cache = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string | null }) => client.setPluginSecret(name, key, value),
    onSuccess: (saved) => cache.setQueryData(keys.pluginSettings(name), saved),
  });
}

/** What a plugin was asked to do, newest first. Asked for each time it is looked at: it changes by itself. */
export function usePluginTasks(name: string, enabled: boolean) {
  const client = useClient();
  return useQuery({ queryKey: keys.pluginTasks(name), queryFn: () => client.listPluginTasks(name), enabled, refetchOnMount: 'always' });
}

export function useRetryPluginTask(name: string) {
  const client = useClient();
  const cache = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.retryPluginTask(name, id),
    onSettled: () => cache.invalidateQueries({ queryKey: keys.pluginTasks(name) }),
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
