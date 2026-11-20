import { ImageOff, Upload } from 'lucide-react';
import { useId, useState } from 'react';
import { FileTrigger, ListBox, ListBoxItem } from 'react-aria-components';
import { Button } from '../../components/Button/index.js';
import { Dialog } from '../../components/Dialog/index.js';
import {
  imagePickerChoiceClass,
  imagePickerChoiceImageClass,
  imagePickerChoiceNameClass,
  imagePickerChoicesClass,
  imagePickerClass,
  imagePickerDescriptionClass,
  imagePickerEmptyClass,
  imagePickerErrorClass,
  imagePickerLabelVariants,
  imagePickerNameClass,
  imagePickerPlaceholderClass,
  imagePickerPlaceholderIconClass,
  imagePickerRequiredMarkClass,
  imagePickerRowClass,
  imagePickerThumbClass,
  imagePickerUploadClass,
  imagePickerUploadErrorClass,
  imagePickerUploadHintClass,
} from './ImagePicker.variants.js';

export interface PickableImage {
  /** What is stored when the image is chosen, and what it is called on screen. */
  readonly name: string;
  /** Where a small copy of it loads from. */
  readonly url: string;
}

export interface ImagePickerProps {
  /** What the image is for, such as "Cover photo". */
  readonly label: string;
  /** Hides the label from view (it is still read out), for a row of a list whose label is in view. */
  readonly isLabelHidden?: boolean;
  readonly description?: string;
  readonly errorMessage?: string;
  readonly isRequired?: boolean;
  /** The name of the chosen image, or `null` when none is. */
  readonly value: string | null;
  /** Every image there is to choose from. */
  readonly images: readonly PickableImage[];
  readonly onChange: (name: string) => void;
  /** The button's words when nothing is chosen, such as "Choose a photo". */
  readonly chooseLabel: string;
  /** The button's words when something is, such as "Change". */
  readonly changeLabel: string;
  /** Shown beside the button when nothing is chosen, such as "No photo chosen". */
  readonly noneText: string;
  /** The title of the window the images are chosen in, such as "Choose a photo". */
  readonly dialogTitle: string;
  /** The name of that window's close button, such as "Close". */
  readonly closeLabel: string;
  /** Shown in the window when there are no images, such as "This site has no photos yet." */
  readonly emptyText: string;
  /**
   * Takes a file the person picked from their computer. Give it and the window offers an upload.
   * Resolve once the image is in `images` and chosen, and the window closes; reject and it
   * stays open, for `uploadError` to say why.
   */
  readonly onUpload?: (file: File) => Promise<void>;
  /** The upload button's words, such as "Upload a photo". Needed with `onUpload`. */
  readonly uploadLabel?: string;
  /** Shown beside the upload button, such as "JPEG, PNG or WebP". */
  readonly uploadHint?: string;
  /** Why the last upload did not work. */
  readonly uploadError?: string;
  /**
   * Given, only the window is drawn, and whoever gave it opens and closes it: for choosing an
   * image from somewhere other than the field, such as the page the image is shown on.
   */
  readonly window?: { readonly isOpen: boolean; readonly onOpenChange: (isOpen: boolean) => void };
}

/** The kinds of file the file chooser offers. What a file really is, the server decides. */
const IMAGE_FILES = ['image/jpeg', 'image/png', 'image/webp'];

/** Shows the image a field holds and lets a person choose another from the site's images. */
export function ImagePicker({
  label,
  isLabelHidden = false,
  description,
  errorMessage,
  isRequired = false,
  value,
  images,
  onChange,
  chooseLabel,
  changeLabel,
  noneText,
  dialogTitle,
  closeLabel,
  emptyText,
  onUpload,
  uploadLabel,
  uploadHint,
  uploadError,
  window: held,
}: ImagePickerProps) {
  const labelId = useId();
  const [isOwnOpen, setOwnOpen] = useState(false);
  const isOpen = held ? held.isOpen : isOwnOpen;
  const setOpen = held ? held.onOpenChange : setOwnOpen;
  const [isUploading, setUploading] = useState(false);
  const upload = async (file: File | undefined) => {
    if (!file || !onUpload) return;
    setUploading(true);
    try {
      await onUpload(file);
      setOpen(false);
    } catch {
      // The window stays open. Whoever gave `onUpload` says what went wrong, in `uploadError`.
    } finally {
      setUploading(false);
    }
  };
  const chosen = images.find((image) => image.name === value);
  const choosing = (
    <Dialog isOpen={isOpen} onOpenChange={setOpen} title={dialogTitle} closeLabel={closeLabel} size="lg">
      {onUpload && uploadLabel !== undefined && (
        <div className={imagePickerUploadClass}>
          <FileTrigger acceptedFileTypes={IMAGE_FILES} onSelect={(files) => void upload(files?.[0])}>
            <Button variant="secondary" size="sm" icon={Upload} isPending={isUploading}>
              {uploadLabel}
            </Button>
          </FileTrigger>
          {uploadError !== undefined ? (
            <p role="alert" className={imagePickerUploadErrorClass}>
              {uploadError}
            </p>
          ) : (
            uploadHint !== undefined && <p className={imagePickerUploadHintClass}>{uploadHint}</p>
          )}
        </div>
      )}
      <ListBox
        aria-label={dialogTitle}
        layout="grid"
        selectionMode="single"
        autoFocus
        selectedKeys={value === null ? [] : [value]}
        onSelectionChange={(keys) => {
          const [name] = keys === 'all' ? [] : [...keys];
          if (typeof name === 'string') onChange(name);
          setOpen(false);
        }}
        renderEmptyState={() => <p className={imagePickerEmptyClass}>{emptyText}</p>}
        className={imagePickerChoicesClass}
      >
        {images.map((image) => (
          <ListBoxItem key={image.name} id={image.name} textValue={image.name} className={imagePickerChoiceClass}>
            <img src={image.url} alt="" loading="lazy" className={imagePickerChoiceImageClass} />
            <span className={imagePickerChoiceNameClass}>{image.name}</span>
          </ListBoxItem>
        ))}
      </ListBox>
    </Dialog>
  );
  if (held) return choosing;

  return (
    <div role="group" aria-labelledby={labelId} className={imagePickerClass}>
      <span id={labelId} className={imagePickerLabelVariants({ isLabelHidden })}>
        {label}
        {isRequired && (
          <span aria-hidden="true" className={imagePickerRequiredMarkClass}>
            {' *'}
          </span>
        )}
      </span>
      <div className={imagePickerRowClass}>
        {chosen ? (
          <img src={chosen.url} alt="" loading="lazy" className={imagePickerThumbClass} />
        ) : (
          <span className={imagePickerPlaceholderClass}>
            <ImageOff aria-hidden="true" className={imagePickerPlaceholderIconClass} />
          </span>
        )}
        <span className={imagePickerNameClass}>{value ?? noneText}</span>
        <Button variant="secondary" size="sm" onPress={() => setOpen(true)}>
          {value === null ? chooseLabel : changeLabel}
        </Button>
      </div>
      {description !== undefined && <p className={imagePickerDescriptionClass}>{description}</p>}
      {errorMessage !== undefined && <p className={imagePickerErrorClass}>{errorMessage}</p>}
      {choosing}
    </div>
  );
}
