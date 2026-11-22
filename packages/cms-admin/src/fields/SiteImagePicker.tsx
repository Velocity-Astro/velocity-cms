import { ImagePicker, toast } from '@velocity-astro/cms-ui';
import { useState } from 'react';
import { useImages, useJustUploaded, useUploadImage, useUploadRules } from '../client/queries.js';
import { NEWEST_FIRST, arrangeImages } from '../lib/arrange-images.js';
import { prepareImage } from '../lib/prepare-image.js';
import { smallOf } from '../lib/small-image.js';
import { useMessages } from '../messages/messages-context.js';

const megabytes = (bytes: number): string => String(Math.round(bytes / 100_000) / 10);

export interface SiteImagePickerProps {
  readonly label: string;
  readonly isLabelHidden?: boolean;
  readonly help?: string;
  readonly problem?: string;
  readonly isRequired?: boolean;
  /** What the field holds: an image's name, or anything else for none. */
  readonly value: unknown;
  readonly onChange: (name: string) => void;
  /** Given, only the window the image is chosen in is drawn, opened and closed by whoever gave it. */
  readonly window?: { readonly isOpen: boolean; readonly onOpenChange: (isOpen: boolean) => void };
}

/**
 * One of the site's images, shown as a picture and chosen from the site's images, or uploaded.
 * What is stored is the image's name. A name with no image is still shown, so opening and saving
 * never drops it. The field in the form and the button on a picture of the page both use it.
 */
export function SiteImagePicker({ label, isLabelHidden = false, help, problem, isRequired = false, value, onChange, window }: SiteImagePickerProps) {
  const messages = useMessages();
  const images = useImages();
  const rules = useUploadRules().data ?? null;
  const uploading = useUploadImage();
  const fresh = useJustUploaded();
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
    toast({ title: messages.editor.imageUploaded, description: messages.editor.imageUploadedDescription, tone: 'success' });
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
      images={arrangeImages(images.data ?? [], NEWEST_FIRST).map((image) => ({
        name: image.name,
        url: smallOf(image),
        ...(fresh.has(image.name) && { badge: messages.media.justUploaded }),
      }))}
      search={{ label: messages.media.search, placeholder: messages.media.searchPlaceholder, clearLabel: messages.media.clearSearch, noMatchesText: messages.media.noMatches }}
      onChange={onChange}
      isRequired={isRequired}
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
      {...(window !== undefined && { window })}
    />
  );
}
