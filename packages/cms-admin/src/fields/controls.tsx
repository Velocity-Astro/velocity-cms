import { fromPlainText, liveFields, type FieldDef, type RichText } from '@velocity/cms-core';
import { DateField, Fieldset, ImagePicker, NumberField, Repeater, RichTextEditor, Select, Switch, Text, TextArea, TextField } from '@velocity/cms-ui';
import { useState } from 'react';
import { useContentTypes, useEntries, useImages, useUploadImage, useUploadRules } from '../client/queries.js';
import { prepareImage } from '../lib/prepare-image.js';
import { entryTitle, groupTranslations, localized, sameData, withValue } from '../lib/content.js';
import { useLocale, useMessages } from '../messages/messages-context.js';
import { createFieldControlRegistry, type FieldControlProps, type FieldControls, type FieldSummaryProps } from './field-control.js';
import { FieldEditor } from './FieldEditor.js';
import { FieldGrid } from './FieldGrid.js';

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

function UrlControl({ field, label, help, isLabelHidden = false, value, onChange, problem }: FieldControlProps) {
  return (
    <TextField
      type="url"
      label={label}
      isLabelHidden={isLabelHidden}
      value={typeof value === 'string' ? value : ''}
      onChange={(next) => onChange(next === '' ? undefined : next)}
      isRequired={field.required}
      {...(help !== undefined && { description: help })}
      {...(problem !== undefined && { errorMessage: problem })}
    />
  );
}

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

const megabytes = (bytes: number): string => String(Math.round(bytes / 100_000) / 10);

/**
 * One of the site's images, shown as a picture and chosen from the site's images. What is stored
 * is the image's name. A name with no image is still shown, so opening and saving never drops it.
 */
function ImageControl({ field, label, help, isLabelHidden = false, value, onChange, problem }: FieldControlProps) {
  const messages = useMessages();
  const images = useImages();
  const rules = useUploadRules().data ?? null;
  const uploading = useUploadImage();
  const [notRead, setNotRead] = useState(false);
  const upload = async (file: File) => {
    setNotRead(false);
    uploading.reset();
    const prepared = await prepareImage(file, rules?.maxBytes ?? 0).catch(() => null);
    if (!prepared) {
      setNotRead(true);
      throw new Error(messages.editor.imageNotRead);
    }
    const image = await uploading.mutateAsync(prepared);
    onChange(image.name);
  };
  const uploadError = notRead ? messages.editor.imageNotRead : uploading.error?.message;
  const current = typeof value === 'string' && value !== '' ? value : null;
  const missing = current !== null && images.isSuccess && !images.data.some((image) => image.name === current);
  const wrong = problem ?? (images.isError ? messages.editor.imagesNotLoaded : missing ? messages.editor.imageMissing : undefined);
  return (
    <ImagePicker
      label={label}
      isLabelHidden={isLabelHidden}
      value={current}
      images={images.data ?? []}
      onChange={onChange}
      isRequired={field.required}
      chooseLabel={messages.editor.imageChoose}
      changeLabel={messages.editor.imageChange}
      noneText={messages.editor.imageNone}
      dialogTitle={messages.editor.imageChoose}
      closeLabel={messages.editor.close}
      emptyText={images.isPending ? messages.editor.imagesLoading : messages.editor.imagesEmpty}
      {...(rules && {
        onUpload: upload,
        uploadLabel: messages.editor.imageUpload,
        uploadHint: messages.editor.imageUploadHint(megabytes(rules.maxBytes)),
      })}
      {...(uploadError !== undefined && { uploadError })}
      {...(help !== undefined && { description: help })}
      {...(wrong !== undefined && { errorMessage: wrong })}
    />
  );
}

/** Text saved before a field became rich text is plain: a string, or a list of paragraphs. */
const isPlainText = (value: unknown): value is string | string[] =>
  typeof value === 'string' || (Array.isArray(value) && value.every((item) => typeof item === 'string'));

/** Text with headings, lists, quotes, bold, italics and links. */
function RichTextControl({ field, label, help, isLabelHidden = false, value, onChange, problem }: FieldControlProps) {
  const messages = useMessages();
  const text = isPlainText(value) ? fromPlainText(value) : typeof value === 'object' && value !== null ? (value as RichText) : null;
  return (
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
  );
}

/** Several fields kept together as one value. Each is drawn by its own control, so groups nest. */
function GroupControl({ field, label, help, value, onChange, path, problem, problems }: FieldControlProps) {
  const inner = Array.isArray(field.options['fields']) ? liveFields(field.options['fields'] as FieldDef[]) : [];
  const values = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return (
    <Fieldset legend={label} {...(help !== undefined && { description: help })}>
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

/**
 * Several values of the same kind, in an order the person chooses. Each item is drawn by the
 * control of the list's item type, so a list of groups and a list of plain text work alike.
 */
function ListControl({ field, label, help, value, onChange, path, problem, problems }: FieldControlProps) {
  const messages = useMessages();
  const stored: readonly unknown[] = Array.isArray(value) ? value : [];
  // What is on screen, which may have items that are still empty. Only filled items are part
  // of the value. When the value changes from outside (a save, another language), it wins.
  const [typed, setTyped] = useState<readonly unknown[]>(stored);
  const items = sameData(typed.filter(isFilled), stored) ? typed : stored;
  const of = (field.options['of'] ?? { type: 'text' }) as { readonly type: string; readonly options?: Readonly<Record<string, unknown>> };
  const max = typeof field.options['max'] === 'number' ? field.options['max'] : undefined;

  const change = (next: readonly unknown[]) => {
    setTyped(next);
    const filled = next.filter(isFilled);
    onChange(filled.length === 0 ? undefined : filled);
  };

  return (
    <Repeater
      label={label}
      {...(help !== undefined && { description: help })}
      {...(problem !== undefined && { errorMessage: problem })}
      emptyText={messages.editor.listEmpty}
      addLabel={messages.editor.listAdd}
      removeLabel={(position) => messages.editor.listRemove(label, position)}
      moveUpLabel={(position) => messages.editor.listMoveUp(label, position)}
      moveDownLabel={(position) => messages.editor.listMoveDown(label, position)}
      isFull={max !== undefined && items.length >= max}
      onAdd={() => change([...items, undefined])}
      onRemove={(index) => change(items.filter((_, at) => at !== index))}
      onMove={(from, to) => {
        const next = [...items];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        change(next);
      }}
      items={items.map((item, index) => ({
        id: String(index),
        content: (
          <FieldEditor
            field={{
              id: `${field.id}.${index}`,
              key: String(index),
              type: of.type,
              label: { [ITEM]: messages.editor.listItem(label, index + 1) },
              translated: field.translated,
              required: false,
              options: of.options ?? {},
            }}
            value={item}
            onChange={(next) => change(items.map((existing, at) => (at === index ? next : existing)))}
            path={`${path}.${index}`}
            problems={problems}
            isLabelHidden
          />
        ),
      }))}
    />
  );
}

/** The language an item's made-up label is filed under. `localized` falls back to it. */
const ITEM = 'en';

/** The controls for the field types every site has. A site or plugin registers more on the result. */
export function createFieldControls(): FieldControls {
  return createFieldControlRegistry()
    .register({ type: 'text-input', Component: TextControl })
    .register({ type: 'url-input', Component: UrlControl })
    .register({ type: 'number-input', Component: NumberControl, width: 'compact', Summary: NumberSummary, summaryAlign: 'end' })
    .register({ type: 'date-picker', Component: DateControl, width: 'compact' })
    .register({ type: 'switch', Component: SwitchControl })
    .register({ type: 'select', Component: SelectControl, width: 'compact', Summary: SelectSummary })
    .register({ type: 'reference', Component: ReferenceControl, width: 'compact' })
    .register({ type: 'image', Component: ImageControl })
    .register({ type: 'rich-text', Component: RichTextControl })
    .register({ type: 'group', Component: GroupControl })
    .register({ type: 'list', Component: ListControl });
}
