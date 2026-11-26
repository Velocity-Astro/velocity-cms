import { EMBED_NAMES, embedFromUrl, fromPlainText, RICH_TEXT_FORMATS, type FieldDef, type RichText, type RichTextFormat, type RichTextLookChoices, type RichTextLooks } from '@velocity-astro/cms-core';
import { Skeleton, SkeletonGroup, Stack, toast } from '@velocity-astro/cms-ui';
import type { RichTextEditorLooks, RichTextLinkValue, RichTextLook, RichTextPicture } from '@velocity-astro/cms-ui/rich-text';
import { lazy, Suspense, useRef, useState, type ReactNode } from 'react';
import { useImages, useUploadImage, useUploadRules } from '../client/queries.js';
import { localized } from '../lib/content.js';
import { loadFresh } from '../lib/load-fresh.js';
import { prepareImage } from '../lib/prepare-image.js';
import { smallOf } from '../lib/small-image.js';
import { useLocale, useMessages } from '../messages/messages-context.js';
import type { FieldControlProps } from './field-control.js';
import { LinkControl } from './LinkControl.js';
import { SiteImagePicker } from './SiteImagePicker.js';

/** Text saved before a field became rich text is plain: a string, or a list of paragraphs. */
const isPlainText = (value: unknown): value is string | string[] => typeof value === 'string' || (Array.isArray(value) && value.every((item) => typeof item === 'string'));

/**
 * The rich text editor is the largest part of the editor by far, and many forms have no rich
 * text. It is fetched the first time a form shows one, not with the first screen.
 */
const RichTextEditor = lazy(async () => ({ default: (await loadFresh(() => import('@velocity-astro/cms-ui/rich-text'))).RichTextEditor }));

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null && !Array.isArray(value);
const LOOK_KINDS = ['colours', 'highlights', 'callouts', 'tables', 'buttons'] as const;

/** One kind of look of the template's, as the field's settings hold it, if it holds one. */
function choicesOf(given: unknown): RichTextLookChoices | undefined {
  if (!isRecord(given) || !Array.isArray(given['choices'])) return undefined;
  const choices = given['choices'].filter((choice): choice is string => typeof choice === 'string');
  return {
    choices,
    ...(isRecord(given['labels']) && { labels: given['labels'] as RichTextLookChoices['labels'] }),
    ...(isRecord(given['swatches']) && { swatches: given['swatches'] as RichTextLookChoices['swatches'] }),
  };
}

/** The looks a field's settings name, as the core reads them. */
export function fieldLooks(field: FieldDef): RichTextLooks {
  return Object.fromEntries(LOOK_KINDS.flatMap((kind) => {
    const choices = choicesOf(field.options[kind]);
    return choices ? [[kind, choices]] : [];
  }));
}

/** The looks for the editor, each named in the editor's language. */
function editorLooks(looks: RichTextLooks, locale: string, tones: Readonly<Record<string, string>>): RichTextEditorLooks {
  const named = (kind: (typeof LOOK_KINDS)[number]): RichTextLook[] | undefined =>
    looks[kind]?.choices.map((name) => {
      const label = looks[kind]?.labels?.[name];
      const swatch = looks[kind]?.swatches?.[name];
      return { name, label: label ? localized(label, locale) : (kind === 'callouts' ? tones[name] : undefined) ?? name, ...(swatch !== undefined && { swatch }) };
    });
  return Object.fromEntries(LOOK_KINDS.flatMap((kind) => {
    const list = named(kind);
    return list ? [[kind, list]] : [];
  }));
}

/** A link field of no type in particular, so the link of a text or a button is chosen as a link field's is. */
const linkField = (label: string): FieldDef => ({ id: 'link', key: 'link', type: 'link', label: { en: label }, translated: false, required: false, options: {} });
const NO_PROBLEMS: ReadonlyMap<string, string> = new Map();

/**
 * Text with headings, lists, quotes, marks and links, and where the field allows it, pictures of
 * the site, tables, code, callouts, details, embeds, buttons and the template's colours.
 */
export function RichTextControl({ field, label, help, isLabelHidden = false, value, onChange, problem }: FieldControlProps) {
  const messages = useMessages();
  const locale = useLocale();
  const images = useImages();
  const rules = useUploadRules().data ?? null;
  const uploading = useUploadImage();
  const given = field.options['formats'];
  const formats = Array.isArray(given) ? RICH_TEXT_FORMATS.filter((format: RichTextFormat) => given.includes(format)) : undefined;
  const looks = fieldLooks(field);
  // The editor shows only what the field allows, and a save keeps only that (`limitRichText`).
  const text = isPlainText(value) ? fromPlainText(value) : isRecord(value) && value['type'] === 'doc' ? (value as unknown as RichText) : null;
  const words = messages.editor.richText;

  // The picker is opened from inside the editor and answers it once a picture is chosen or it closes.
  const [picking, setPicking] = useState(false);
  const answer = useRef<((picture: RichTextPicture | undefined) => void) | null>(null);
  const settle = (picture: RichTextPicture | undefined) => {
    answer.current?.(picture);
    answer.current = null;
  };
  const srcOf = (name: string): string | undefined => {
    const image = images.data?.find((candidate) => candidate.name === name);
    return image && smallOf(image);
  };

  const upload = async (file: File): Promise<RichTextPicture | undefined> => {
    if (!rules) return undefined;
    const prepared = await prepareImage(file, rules.maxBytes).catch(() => null);
    if (!prepared) {
      toast({ title: messages.editor.imageNotRead, tone: 'danger' });
      return undefined;
    }
    try {
      const image = await uploading.mutateAsync(prepared);
      toast({ title: messages.editor.imageUploaded, description: messages.editor.imageUploadedDescription, tone: 'success' });
      return { image: image.name, src: smallOf(image) };
    } catch (error) {
      toast({ title: messages.editor.imageNotUploaded, description: error instanceof Error ? error.message : String(error), tone: 'danger' });
      return undefined;
    }
  };

  const chooser = (current: RichTextLinkValue | undefined, onLeads: (next: RichTextLinkValue | undefined) => void): ReactNode => (
    <LinkControl
      field={linkField(words.linkAddress)}
      label={words.linkAddress}
      value={current}
      onChange={(next) => onLeads(isRecord(next) ? (next as unknown as RichTextLinkValue) : undefined)}
      path="link"
      problem={undefined}
      problems={NO_PROBLEMS}
    />
  );

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
        words={words}
        looks={editorLooks(looks, locale, words.tones)}
        onPickImage={() =>
          new Promise<RichTextPicture | undefined>((resolve) => {
            settle(undefined);
            answer.current = resolve;
            setPicking(true);
          })
        }
        imageSrc={srcOf}
        renderLinkChooser={chooser}
        embedFrom={(address) => embedFromUrl(address)}
        embedName={(provider) => EMBED_NAMES[provider as keyof typeof EMBED_NAMES] ?? provider}
        onPasteDropped={(pictures) => toast({ title: messages.editor.pastedPicturesLeftOut(pictures), description: messages.editor.pastedPicturesLeftOutDescription })}
        {...(rules && { onUploadImage: upload })}
        {...(formats !== undefined && { formats })}
        {...(help !== undefined && { description: help })}
        {...(problem !== undefined && { errorMessage: problem })}
      />
      {picking && (
        <SiteImagePicker
          label={words.picture}
          value={undefined}
          onChange={(name) => {
            setPicking(false);
            settle({ image: name, src: srcOf(name) });
          }}
          window={{
            isOpen: true,
            onOpenChange: (isOpen) => {
              if (isOpen) return;
              setPicking(false);
              settle(undefined);
            },
          }}
        />
      )}
    </Suspense>
  );
}
