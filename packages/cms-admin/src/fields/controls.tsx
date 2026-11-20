import { fromPlainText, liveFields, type FieldDef, type RichText } from '@velocity-astro/cms-core';
import { DateField, Fieldset, NumberField, Repeater, SectionList, Select, Skeleton, SkeletonGroup, Stack, Switch, Text, TextArea, TextField } from '@velocity-astro/cms-ui';
import { Copy, Trash2 } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useContentTypes, useEntries, useForms } from '../client/queries.js';
import { entryTitle, groupTranslations, localized, sameData, withValue } from '../lib/content.js';
import { richTextFromHtml } from '../lib/rich-from-html.js';
import { useLocale, useMessages } from '../messages/messages-context.js';
import { createFieldControlRegistry, type FieldControl, type FieldControlProps, type FieldControls, type FieldSummaryProps, type LinkPlace, type ListPlace, type PicturePlace, type WordsPlace } from './field-control.js';
import { BlocksControl } from './BlocksControl.js';
import { FieldEditor } from './FieldEditor.js';
import { FieldGrid } from './FieldGrid.js';
import { useControlFor } from './FieldSummary.js';
import { LinkControl } from './LinkControl.js';
import { SiteImagePicker } from './SiteImagePicker.js';

/** A field setting, when it is a number. Settings are checked by the server, not here. */
function numberOption(field: FieldDef, name: string): number | undefined {
  const option = field.options[name];
  return typeof option === 'number' ? option : undefined;
}

function TextControl({ field, label, help, isLabelHidden = false, value, onChange, problem }: FieldControlProps) {
  const shared = {
    label,
    isLabelHidden,
    ...(help !== undefined && { description: help }),
    value: typeof value === 'string' ? value : '',
    onChange: (next: string) => onChange(next === '' ? undefined : next),
    isRequired: field.required,
    ...(problem !== undefined && { errorMessage: problem }),
  };
  return field.options['multiline'] === true ? <TextArea {...shared} /> : <TextField {...shared} />;
}

/** A control for one line of a kind the browser knows: an address, an email, a phone number. */
const typedControl = (type: 'url' | 'email' | 'tel') =>
  function TypedControl({ field, label, help, isLabelHidden = false, value, onChange, problem }: FieldControlProps) {
    return (
      <TextField
        type={type}
        label={label}
        isLabelHidden={isLabelHidden}
        value={typeof value === 'string' ? value : ''}
        onChange={(next) => onChange(next === '' ? undefined : next)}
        isRequired={field.required}
        {...(help !== undefined && { description: help })}
        {...(problem !== undefined && { errorMessage: problem })}
      />
    );
  };

const UrlControl = typedControl('url');
const EmailControl = typedControl('email');
const PhoneControl = typedControl('tel');

function NumberControl({ field, label, help, isLabelHidden = false, value, onChange, problem }: FieldControlProps) {
  const min = numberOption(field, 'min');
  const max = numberOption(field, 'max');
  return (
    <NumberField
      label={label}
      isLabelHidden={isLabelHidden}
      value={typeof value === 'number' ? value : null}
      onChange={(next) => onChange(next ?? undefined)}
      width="full"
      isInteger={field.options['integer'] === true}
      isRequired={field.required}
      {...(min !== undefined && { minValue: min })}
      {...(max !== undefined && { maxValue: max })}
      {...(help !== undefined && { description: help })}
      {...(problem !== undefined && { errorMessage: problem })}
    />
  );
}

function DateControl({ field, label, help, isLabelHidden = false, value, onChange, problem }: FieldControlProps) {
  return (
    <DateField
      width="full"
      label={label}
      isLabelHidden={isLabelHidden}
      value={typeof value === 'string' ? value : null}
      onChange={(next) => onChange(next ?? undefined)}
      isRequired={field.required}
      {...(help !== undefined && { description: help })}
      {...(problem !== undefined && { errorMessage: problem })}
    />
  );
}

function SwitchControl({ label, value, onChange }: FieldControlProps) {
  return <Switch label={label} isSelected={value === true} onChange={onChange} />;
}

/** A figure as the reader's language writes it: 1,185,000. */
function NumberSummary({ value }: FieldSummaryProps) {
  const locale = useLocale();
  return <Text size="sm">{typeof value === 'number' ? new Intl.NumberFormat(locale).format(value) : String(value)}</Text>;
}

/** What each choice of a select field is called, when the field says. The stored value otherwise. */
function choiceName(field: FieldDef, choice: string, locale: string): string {
  const labels = (field.options['labels'] ?? {}) as Readonly<Record<string, Readonly<Record<string, string>> | undefined>>;
  const name = labels[choice];
  return name ? localized(name, locale) : choice;
}

function SelectSummary({ field, value }: FieldSummaryProps) {
  const locale = useLocale();
  return <Text size="sm">{choiceName(field, String(value), locale)}</Text>;
}

function SelectControl({ field, label, help, isLabelHidden = false, value, onChange, problem }: FieldControlProps) {
  const messages = useMessages();
  const locale = useLocale();
  const choices = Array.isArray(field.options['choices']) ? field.options['choices'].filter((choice) => typeof choice === 'string') : [];
  return (
    <Select
      label={label}
      isLabelHidden={isLabelHidden}
      {...(help !== undefined && { description: help })}
      options={choices.map((choice) => ({ id: choice, label: choiceName(field, choice, locale) }))}
      placeholder={messages.editor.choose}
      onChange={onChange}
      isRequired={field.required}
      {...(typeof value === 'string' && { value })}
      {...(problem !== undefined && { errorMessage: problem })}
    />
  );
}

/** As many entries as can be offered to link to. A longer list needs a search, which comes with search on the server. */
const LINKABLE = 200;

/**
 * A link to an entry of another type, chosen by name. What is stored is the entry's slug. A
 * link to an entry that is no longer there is still offered, by its slug, so opening and
 * saving never drops it.
 */
function ReferenceControl({ field, label, help, isLabelHidden = false, value, onChange, problem }: FieldControlProps) {
  const messages = useMessages();
  const locale = useLocale();
  const to = typeof field.options['to'] === 'string' ? field.options['to'] : '';
  const types = useContentTypes();
  const entries = useEntries({ type: to, limit: LINKABLE });
  const type = types.data?.find((candidate) => candidate.key === to);

  const found = type
    ? groupTranslations(entries.data?.items ?? [], locale).map(({ primary }) => ({ id: primary.slug, label: entryTitle(type, primary.data) ?? primary.slug }))
    : [];
  const options = found
    // Two entries may share a name; the list still needs one row per slug.
    .filter((option, index) => found.findIndex((other) => other.id === option.id) === index)
    .sort((a, b) => a.label.localeCompare(b.label, locale));
  const current = typeof value === 'string' ? value : undefined;
  const missing = current !== undefined && !options.some((option) => option.id === current);
  const wrong = problem ?? (entries.isError ? messages.editor.linkNotLoaded : undefined);

  return (
    <Select
      label={label}
      isLabelHidden={isLabelHidden}
      options={missing ? [{ id: current, label: entries.isSuccess ? messages.editor.linkMissing(current) : current }, ...options] : options}
      placeholder={messages.editor.choose}
      onChange={onChange}
      isRequired={field.required}
      {...(current !== undefined && { value: current })}
      {...(help !== undefined && { description: help })}
      {...(wrong !== undefined && { errorMessage: wrong })}
    />
  );
}

/**
 * One of the site's forms, chosen by name. What is stored is the form's id, so renaming a form
 * breaks nothing. A form that is no longer there is still offered, so opening and saving never
 * drops the choice: the site leaves the form out until another is chosen.
 */
function FormControl({ field, label, help, isLabelHidden = false, value, onChange, problem }: FieldControlProps) {
  const messages = useMessages();
  const locale = useLocale();
  const forms = useForms();
  const options = (forms.data ?? [])
    .map((form) => ({ id: form.id, label: form.open ? localized(form.label, locale) : messages.editor.formClosed(localized(form.label, locale)) }))
    .sort((a, b) => a.label.localeCompare(b.label, locale));
  const current = typeof value === 'string' ? value : undefined;
  const missing = current !== undefined && !options.some((option) => option.id === current);
  const wrong = problem ?? (forms.isError ? messages.editor.linkNotLoaded : undefined);
  const empty = forms.isSuccess && options.length === 0 ? messages.editor.noForms : undefined;
  const description = empty ?? help;

  return (
    <Select
      label={label}
      isLabelHidden={isLabelHidden}
      options={missing ? [{ id: current, label: forms.isSuccess ? messages.editor.formMissing : messages.editor.formLoading }, ...options] : options}
      placeholder={messages.editor.choose}
      onChange={onChange}
      isRequired={field.required}
      {...(current !== undefined && { value: current })}
      {...(description !== undefined && { description })}
      {...(wrong !== undefined && { errorMessage: wrong })}
    />
  );
}

/** One of the site's images, shown as a picture and chosen from the site's images. */
function ImageControl({ field, label, help, isLabelHidden = false, value, onChange, problem }: FieldControlProps) {
  return (
    <SiteImagePicker
      label={label}
      isLabelHidden={isLabelHidden}
      value={value}
      onChange={onChange}
      isRequired={field.required}
      {...(help !== undefined && { help })}
      {...(problem !== undefined && { problem })}
    />
  );
}

/** Text saved before a field became rich text is plain: a string, or a list of paragraphs. */
const isPlainText = (value: unknown): value is string | string[] =>
  typeof value === 'string' || (Array.isArray(value) && value.every((item) => typeof item === 'string'));

/**
 * The rich text editor is the largest part of the editor by far, and many forms have no rich
 * text. It is fetched the first time a form shows one, not with the first screen.
 */
const RichTextEditor = lazy(async () => ({ default: (await import('@velocity-astro/cms-ui/rich-text')).RichTextEditor }));

/** Text with headings, lists, quotes, bold, italics and links. */
function RichTextControl({ field, label, help, isLabelHidden = false, value, onChange, problem }: FieldControlProps) {
  const messages = useMessages();
  const text = isPlainText(value) ? fromPlainText(value) : typeof value === 'object' && value !== null ? (value as RichText) : null;
  return (
    <Suspense
      fallback={
        <SkeletonGroup label={messages.app.loading}>
          <Stack gap={2}>
            <Skeleton width="sm" />
            <Skeleton shape="block" />
          </Stack>
        </SkeletonGroup>
      }
    >
      <RichTextEditor
        label={label}
        isLabelHidden={isLabelHidden}
        value={text}
        // Nothing to read is an empty field, so "required" means what it says.
        onChange={(next) => onChange(next ?? undefined)}
        isRequired={field.required}
        words={messages.editor.richText}
        {...(help !== undefined && { description: help })}
        {...(problem !== undefined && { errorMessage: problem })}
      />
    </Suspense>
  );
}

/** Several fields kept together as one value. Each is drawn by its own control, so groups nest. */
function GroupControl({ field, label, help, isLabelHidden = false, value, onChange, path, problem, problems }: FieldControlProps) {
  const inner = Array.isArray(field.options['fields']) ? liveFields(field.options['fields'] as FieldDef[]) : [];
  const values = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return (
    <Fieldset legend={label} isLegendHidden={isLabelHidden} {...(help !== undefined && { description: help })}>
      {problem !== undefined && (
        <Text size="sm" tone="danger">
          {problem}
        </Text>
      )}
      <FieldGrid
        fields={inner}
        values={values}
        onChange={(child, next) => {
          const changed = withValue(values, child.id, next);
          // A group with nothing in it is an empty field, not a value with empty parts.
          onChange(Object.keys(changed).length === 0 ? undefined : changed);
        }}
        pathOf={(child) => `${path}.${child.key}`}
        problems={problems}
      />
    </Fieldset>
  );
}

const isFilled = (item: unknown) => item !== undefined && item !== null;

type ControlFor = (type: string) => FieldControl | undefined;
const under = (key: string, place: string) => (place === '' ? key : `${key}.${place}`);

/** Text is its own words. An empty field is a place too: one emptied on the page is typed into again. */
const textWords = (_field: FieldDef, value: unknown): readonly WordsPlace[] =>
  value === undefined || value === null || typeof value === 'string' ? [{ place: '', put: (words) => (words === '' ? undefined : words) }] : [];

/** A place of any kind: where it is, and how the value reads with something else there. */
interface AnyPlace {
  readonly place: string;
  readonly put: (held: never) => unknown;
}
type Places<Place extends AnyPlace> = (field: FieldDef, value: unknown, controlFor: ControlFor) => readonly Place[];
type Asked = 'words' | 'pictures' | 'links' | 'lists';
const putAt = (found: AnyPlace, held: unknown): unknown => (found.put as (held: unknown) => unknown)(held);

/**
 * Formatted text is written on the page where the page shows it as it is held. What the page
 * sends back is its markup, and only what the format keeps is taken from it.
 */
const richWords = (): readonly WordsPlace[] => [{ place: '', put: (html) => richTextFromHtml(html) }];

/** A group holds the places of its fields, each under the field's key. */
function inGroup<Place extends AnyPlace>(asked: Asked, field: FieldDef, value: unknown, controlFor: ControlFor): readonly Place[] {
  const inner = Array.isArray(field.options['fields']) ? liveFields(field.options['fields'] as FieldDef[]) : [];
  const values = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return inner.flatMap((child) =>
    ((controlFor(child.type)?.[asked] as Places<Place> | undefined)?.(child, values[child.id], controlFor) ?? []).map((found) => ({
      ...found,
      place: under(child.key, found.place),
      put: (held: unknown) => {
        const changed = withValue(values, child.id, putAt(found, held));
        return Object.keys(changed).length === 0 ? undefined : changed;
      },
    })),
  );
}

/** A list holds the places of its items, each under the item's place. An item emptied on the page keeps its place. */
function inList<Place extends AnyPlace>(asked: Asked, field: FieldDef, value: unknown, controlFor: ControlFor): readonly Place[] {
  const items: readonly unknown[] = Array.isArray(value) ? value : [];
  const of = (field.options['of'] ?? { type: 'text' }) as { readonly type: string; readonly options?: Readonly<Record<string, unknown>> };
  const places = controlFor(of.type)?.[asked] as Places<Place> | undefined;
  if (!places) return [];
  return items.flatMap((item, index) =>
    places({ ...field, id: `${field.id}.${index}`, key: String(index), type: of.type, required: false, options: of.options ?? {} }, item, controlFor).map((found) => ({
      ...found,
      place: under(String(index), found.place),
      put: (held: unknown) => items.map((existing, at) => (at === index ? (putAt(found, held) ?? (typeof existing === 'string' ? '' : {})) : existing)),
    })),
  );
}

const groupWords: Places<WordsPlace> = (field, value, controlFor) => inGroup('words', field, value, controlFor);
const listWords: Places<WordsPlace> = (field, value, controlFor) => inList('words', field, value, controlFor);
const groupPictures: Places<PicturePlace> = (field, value, controlFor) => inGroup('pictures', field, value, controlFor);
const listPictures: Places<PicturePlace> = (field, value, controlFor) => inList('pictures', field, value, controlFor);

const groupLinks: Places<LinkPlace> = (field, value, controlFor) => inGroup('links', field, value, controlFor);
const listLinks: Places<LinkPlace> = (field, value, controlFor) => inList('links', field, value, controlFor);

const groupLists: Places<ListPlace> = (field, value, controlFor) => inGroup('lists', field, value, controlFor);
/** A list is a place itself, and holds the lists of its items. */
const listLists: Places<ListPlace> = (field, value, controlFor) => {
  const items: readonly unknown[] = Array.isArray(value) ? value : [];
  const max = typeof field.options['max'] === 'number' ? field.options['max'] : undefined;
  const own: ListPlace = { place: '', items, isFull: max !== undefined && items.length >= max, put: (next) => (next.length === 0 ? undefined : next) };
  return [own, ...inList<ListPlace>('lists', field, value, controlFor)];
};

/** A link field is its own link, chosen or not. */
const linkLinks = (field: FieldDef, value: unknown): readonly LinkPlace[] => [{ place: '', field, link: value, put: (link) => link }];

/** An image field is its own picture, chosen or not. */
const imagePictures = (_field: FieldDef, value: unknown): readonly PicturePlace[] => [{ place: '', name: typeof value === 'string' && value !== '' ? value : null, put: (name) => name }];

/** One item of a list on screen. Its id stays with it while it is moved, so an open row stays open. */
interface Row {
  readonly id: string;
  readonly value: unknown;
}
const asRow = (value: unknown, index: number): Row => ({ id: `stored-${index}`, value });

/** A group is called by the first words written in it. */
function groupTitle(field: FieldDef, value: unknown): string | undefined {
  const inner = Array.isArray(field.options['fields']) ? liveFields(field.options['fields'] as FieldDef[]) : [];
  const values = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  for (const child of inner) {
    const words = values[child.id];
    if (typeof words === 'string' && words.trim() !== '') return words;
  }
  return undefined;
}

/**
 * Several values of the same kind, in an order the person chooses. Each item is drawn by the
 * control of the list's item type, so a list of groups and a list of plain text work alike.
 */
function ListControl({ field, label, help, value, onChange, path, problem, problems }: FieldControlProps) {
  const messages = useMessages();
  const stored: readonly unknown[] = Array.isArray(value) ? value : [];
  // What is on screen, which may have items that are still empty. Only filled items are part
  // of the value. When the value changes from outside (a save, another language), it wins.
  const [typed, setTyped] = useState<readonly Row[]>(() => stored.map(asRow));
  const rows = sameData(typed.map((row) => row.value).filter(isFilled), stored) ? typed : stored.map(asRow);
  const [openIds, setOpenIds] = useState<readonly string[]>([]);
  const of = (field.options['of'] ?? { type: 'text' }) as { readonly type: string; readonly options?: Readonly<Record<string, unknown>> };
  const max = typeof field.options['max'] === 'number' ? field.options['max'] : undefined;

  const change = (next: readonly Row[]) => {
    setTyped(next);
    const filled = next.map((row) => row.value).filter(isFilled);
    onChange(filled.length === 0 ? undefined : filled);
  };

  const controlFor = useControlFor();
  const titleOf = controlFor(of.type)?.titleOf;
  const itemField = (index: number): FieldDef => ({
    id: `${field.id}.${index}`,
    key: String(index),
    type: of.type,
    label: { [ITEM]: messages.editor.listItem(label, index + 1) },
    translated: field.translated,
    required: false,
    options: of.options ?? {},
  });
  const move = (from: number, to: number) => {
    const next = [...rows];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    change(next);
  };
  const editor = (row: Row, index: number) => (
    <FieldEditor
      field={itemField(index)}
      value={row.value}
      onChange={(next) => change(rows.map((existing) => (existing.id === row.id ? { ...existing, value: next } : existing)))}
      path={`${path}.${index}`}
      problems={problems}
      isLabelHidden
    />
  );
  const shared = {
    label,
    ...(help !== undefined && { description: help }),
    ...(problem !== undefined && { errorMessage: problem }),
    emptyText: messages.editor.listEmpty,
    addLabel: messages.editor.listAdd,
    isFull: max !== undefined && rows.length >= max,
    onMove: move,
    moveUpLabel: (position: number) => messages.editor.listMoveUp(label, position),
    moveDownLabel: (position: number) => messages.editor.listMoveDown(label, position),
  };
  const add = () => {
    const added: Row = { id: crypto.randomUUID(), value: undefined };
    change([...rows, added]);
    setOpenIds((ids) => [...ids, added.id]);
  };

  // Items with words of their own (a group) are rows that open, so a long list stays short.
  if (titleOf) {
    return (
      <SectionList
        {...shared}
        onAdd={add}
        openIds={openIds}
        onOpenChange={(id, isOpen) => setOpenIds((ids) => (isOpen ? [...ids, id] : ids.filter((candidate) => candidate !== id)))}
        moreLabel={(position) => messages.editor.listMore(label, position)}
        dragLabel={(position) => messages.editor.listDrag(label, position)}
        onAction={(id, action) => {
          const at = rows.findIndex((row) => row.id === id);
          const row = rows[at];
          if (!row) return;
          if (action === 'remove') change(rows.filter((existing) => existing.id !== id));
          else if (action === 'duplicate') change([...rows.slice(0, at + 1), { id: crypto.randomUUID(), value: structuredClone(row.value) }, ...rows.slice(at + 1)]);
        }}
        items={rows.map((row, index) => {
          const prefix = `${path}.${index}`;
          const found = [...problems.keys()].filter((key) => key === prefix || key.startsWith(`${prefix}.`)).length;
          return {
            id: row.id,
            title: titleOf(itemField(index), row.value) ?? messages.editor.listItem(label, index + 1),
            ...(found > 0 && { problem: messages.editor.listProblems(found) }),
            actions: [
              { id: 'duplicate', label: messages.editor.listDuplicate, icon: Copy, isDisabled: shared.isFull },
              { id: 'remove', label: messages.editor.listRemoveRow, icon: Trash2, tone: 'danger' as const },
            ],
            content: editor(row, index),
          };
        })}
      />
    );
  }

  return (
    <Repeater
      {...shared}
      onAdd={add}
      removeLabel={(position) => messages.editor.listRemove(label, position)}
      onRemove={(index) => change(rows.filter((_, at) => at !== index))}
      items={rows.map((row, index) => ({ id: row.id, content: editor(row, index) }))}
    />
  );
}

/** The language an item's made-up label is filed under. `localized` falls back to it. */
const ITEM = 'en';

/** The controls for the field types every site has. A site or plugin registers more on the result. */
export function createFieldControls(): FieldControls {
  return createFieldControlRegistry()
    .register({ type: 'text-input', Component: TextControl, words: textWords })
    .register({ type: 'url-input', Component: UrlControl })
    .register({ type: 'email-input', Component: EmailControl })
    .register({ type: 'phone-input', Component: PhoneControl })
    .register({ type: 'number-input', Component: NumberControl, width: 'compact', Summary: NumberSummary, summaryAlign: 'end' })
    .register({ type: 'date-picker', Component: DateControl, width: 'compact' })
    .register({ type: 'switch', Component: SwitchControl })
    .register({ type: 'select', Component: SelectControl, width: 'compact', Summary: SelectSummary })
    .register({ type: 'reference', Component: ReferenceControl, width: 'compact' })
    .register({ type: 'form-picker', Component: FormControl, width: 'compact' })
    .register({ type: 'link', Component: LinkControl, links: linkLinks })
    .register({ type: 'image', Component: ImageControl, pictures: imagePictures })
    .register({ type: 'rich-text', Component: RichTextControl, words: richWords })
    .register({ type: 'group', Component: GroupControl, titleOf: groupTitle, words: groupWords, pictures: groupPictures, links: groupLinks, lists: groupLists })
    .register({ type: 'list', Component: ListControl, words: listWords, pictures: listPictures, links: listLinks, lists: listLists })
    .register({ type: 'blocks', Component: BlocksControl, showsPage: true });
}
