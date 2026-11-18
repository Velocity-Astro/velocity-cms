import { isLiveType, type ContentTypeDef } from '@velocity-astro/cms-core';
import { Grid, Select, TextField } from '@velocity-astro/cms-ui';
import { useState } from 'react';
import { useContentTypes, useEntries } from '../client/queries.js';
import { entryTitle, groupTranslations, localized } from '../lib/content.js';
import { useLocale, useMessages } from '../messages/messages-context.js';
import type { FieldControlProps } from './field-control.js';

/** As many entries as can be offered to link to. A longer list needs a search, which comes with search on the server. */
const LINKABLE = 200;
/** What the first choice is called when the link is an address typed by hand. No content type can have this key. */
const ADDRESS = ':address';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

interface EntryChoiceProps {
  readonly type: ContentTypeDef;
  /** The chosen entry, as the id all its translations share. */
  readonly chosen: string | undefined;
  readonly onChange: (entry: string) => void;
  readonly problem: string | undefined;
}

/** The entries of one content type, by name. One that is no longer there is still offered, so opening and saving never drops it. */
function EntryChoice({ type, chosen, onChange, problem }: EntryChoiceProps) {
  const messages = useMessages();
  const locale = useLocale();
  const entries = useEntries({ type: type.key, limit: LINKABLE });
  const options = groupTranslations(entries.data?.items ?? [], locale)
    .map(({ primary }) => ({ id: primary.translationGroup, label: entryTitle(type, primary.data) ?? primary.slug }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));
  const missing = chosen !== undefined && !options.some((option) => option.id === chosen);
  const wrong = problem ?? (entries.isError ? messages.editor.linkNotLoaded : undefined);
  return (
    <Select
      label={messages.editor.linkWhich(localized(type.label, locale))}
      options={missing ? [{ id: chosen, label: entries.isSuccess ? messages.editor.linkGone : messages.editor.linkLoading }, ...options] : options}
      placeholder={messages.editor.choose}
      onChange={onChange}
      isRequired
      {...(chosen !== undefined && { value: chosen })}
      {...(wrong !== undefined && { errorMessage: wrong })}
    />
  );
}

/**
 * Where a link leads: a page of this site, chosen by name, or an address typed by hand. A page
 * is stored as the entry it belongs to, never as its address, so the link follows the page when
 * its address changes. Until both halves are filled in the field is empty.
 */
export function LinkControl({ field, label, help, isLabelHidden = false, value, onChange, path, problem, problems }: FieldControlProps) {
  const messages = useMessages();
  const locale = useLocale();
  const types = useContentTypes();
  const allowed = Array.isArray(field.options['to']) ? (field.options['to'] as unknown[]) : undefined;
  // Only an entry with a page of its own can be linked to.
  const linkable = (types.data ?? []).filter((type) => isLiveType(type) && type.urlPattern !== undefined && (allowed === undefined || allowed.includes(type.key)));

  const stored = isRecord(value) ? value : undefined;
  const storedWhere = stored?.['kind'] === 'address' ? ADDRESS : typeof stored?.['type'] === 'string' ? stored['type'] : undefined;
  // What was chosen first while the second half is still empty. A stored link wins over it.
  const [picked, setPicked] = useState<string | undefined>(storedWhere);
  const where = storedWhere ?? picked;
  const type = linkable.find((candidate) => candidate.key === where);
  const inner = problems.get(`${path}.href`) ?? problems.get(`${path}.entry`) ?? problems.get(`${path}.type`) ?? problems.get(`${path}.kind`) ?? problem;

  const places = [...linkable.map((candidate) => ({ id: candidate.key, label: localized(candidate.label, locale) })), { id: ADDRESS, label: messages.editor.linkAddressChoice }];
  // A link to a type that has since lost its page, or been archived, is still shown.
  const known = where === undefined || places.some((place) => place.id === where);

  return (
    <Grid columns={2} gap={4}>
      <Select
        label={label}
        isLabelHidden={isLabelHidden}
        options={known || where === undefined ? places : [{ id: where, label: types.isSuccess ? messages.editor.linkMissing(where) : where }, ...places]}
        placeholder={messages.editor.choose}
        isRequired={field.required}
        onChange={(next) => {
          if (next === where) return;
          setPicked(next);
          onChange(undefined);
        }}
        {...(where !== undefined && { value: where })}
        {...(help !== undefined && { description: help })}
        {...(where === undefined && inner !== undefined && { errorMessage: inner })}
      />
      {where === ADDRESS && (
        <TextField
          label={messages.editor.linkAddress}
          description={messages.editor.linkAddressHelp}
          value={typeof stored?.['href'] === 'string' ? stored['href'] : ''}
          onChange={(href) => onChange(href.trim() === '' ? undefined : { kind: 'address', href: href.trim() })}
          isRequired
          {...(inner !== undefined && { errorMessage: inner })}
        />
      )}
      {type !== undefined && (
        <EntryChoice
          type={type}
          chosen={typeof stored?.['entry'] === 'string' ? stored['entry'] : undefined}
          onChange={(entry) => onChange({ kind: 'entry', type: type.key, entry })}
          problem={inner}
        />
      )}
    </Grid>
  );
}
