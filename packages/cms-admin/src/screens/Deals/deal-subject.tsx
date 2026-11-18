import { isLiveType, type ContentTypeDef, type DealSubject } from '@velocity/cms-core';
import { Grid, Select } from '@velocity/cms-ui';
import { useState } from 'react';
import { useContentTypes, useEntriesOfTypes } from '../../client/queries.js';
import { entryTitle, groupTranslations, localized } from '../../lib/content.js';
import { useLocale, useMessages } from '../../messages/messages-context.js';

/** As many entries of a type as can be offered. A longer list needs a search, which comes with search on the server. */
const OFFERED = 200;
/** The first choice: a deal about nothing on the site. No content type can have this id. */
const NOTHING = ':nothing';

interface SubjectChoice {
  readonly id: string;
  readonly label: string;
}

export interface DealSubjects {
  /** The content types a deal can be about. */
  readonly types: readonly ContentTypeDef[];
  /** The entries of one of them, by name. */
  readonly entriesOf: (typeId: string) => readonly SubjectChoice[];
  /** What a deal's subject is called, once its type's entries are here. */
  readonly nameOf: (about: DealSubject | undefined) => string | undefined;
  readonly isLoaded: boolean;
}

/** What deals can be about on this site: the content types that say so, and their entries by name. */
export function useDealSubjects(): DealSubjects {
  const locale = useLocale();
  const all = useContentTypes();
  const types = (all.data ?? []).filter((type) => isLiveType(type) && type.forDeals === true);
  const lists = useEntriesOfTypes(types.map((type) => ({ type: type.key, limit: OFFERED })));
  const choices = new Map<string, SubjectChoice[]>();
  types.forEach((type, index) => {
    choices.set(
      type.id,
      groupTranslations(lists[index]?.data?.items ?? [], locale)
        .map(({ primary }) => ({ id: primary.translationGroup, label: entryTitle(type, primary.data) ?? primary.slug }))
        .sort((a, b) => a.label.localeCompare(b.label, locale)),
    );
  });
  return {
    types,
    entriesOf: (typeId) => choices.get(typeId) ?? [],
    nameOf: (about) => (about === undefined ? undefined : choices.get(about.typeId)?.find((choice) => choice.id === about.entry)?.label),
    isLoaded: all.isSuccess && lists.every((list) => list.isSuccess),
  };
}

export interface DealSubjectFieldsProps {
  readonly subjects: DealSubjects;
  readonly about: DealSubject | undefined;
  /** Told the entry's name with it, so a deal with no words of its own yet can take them. */
  readonly onChange: (about: DealSubject | undefined, name?: string) => void;
  readonly problem: string | undefined;
}

/**
 * What on the site a deal is about: a kind of content, then one of its entries. Shown only on a
 * site where some content type takes deals, or for a deal that is about something already.
 */
export function DealSubjectFields({ subjects, about, onChange, problem }: DealSubjectFieldsProps) {
  const messages = useMessages();
  const locale = useLocale();
  // The kind chosen while no entry of it is chosen yet. A stored subject wins over it.
  const [picked, setPicked] = useState<string>(about?.typeId ?? NOTHING);
  const where = about?.typeId ?? picked;
  if (subjects.types.length === 0 && about === undefined) return null;

  const kinds = [{ id: NOTHING, label: messages.deals.aboutNothing }, ...subjects.types.map((type) => ({ id: type.id, label: localized(type.label, locale) }))];
  const type = subjects.types.find((candidate) => candidate.id === where);
  const entries = where === NOTHING ? [] : subjects.entriesOf(where);
  // A subject whose entry has gone, or whose type no longer takes deals, is still shown, so saving never drops it.
  const isKnownKind = kinds.some((kind) => kind.id === where);
  const isKnownEntry = about === undefined || entries.some((entry) => entry.id === about.entry);
  const gone = subjects.isLoaded ? messages.deals.aboutGone : messages.deals.aboutLoading;
  return (
    <Grid columns={2} gap={3}>
      <Select
        label={messages.deals.about}
        options={isKnownKind ? kinds : [...kinds, { id: where, label: gone }]}
        value={where}
        onChange={(next) => {
          if (next === where) return;
          setPicked(next);
          onChange(undefined);
        }}
        {...(where === NOTHING && problem !== undefined && { errorMessage: problem })}
      />
      {where !== NOTHING && (
        <Select
          label={type ? messages.deals.aboutWhich(localized(type.label, locale)) : messages.deals.aboutWhichOne}
          options={isKnownEntry || about === undefined ? entries : [{ id: about.entry, label: gone }, ...entries]}
          placeholder={messages.editor.choose}
          onChange={(entry) => onChange({ typeId: where, entry }, entries.find((candidate) => candidate.id === entry)?.label)}
          {...(about !== undefined && { value: about.entry })}
          {...(problem !== undefined && { errorMessage: problem })}
        />
      )}
    </Grid>
  );
}
