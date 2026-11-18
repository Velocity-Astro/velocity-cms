import { ImageOff } from 'lucide-react';
import { thumbnailEmptyVariants, thumbnailIconClass, thumbnailVariants, type ThumbnailVariants } from './Thumbnail.variants.js';

export interface ThumbnailProps extends ThumbnailVariants {
  /** Where the picture loads from. Left out, an empty frame of the same size is shown. */
  readonly src?: string;
}

/**
 * A small picture beside the words that name it, such as a listing's photo in a list. It is
 * decoration: the words next to it carry the meaning, so it is hidden from screen readers.
 */
export function Thumbnail({ src, size, shape }: ThumbnailProps) {
  if (src === undefined) {
    return (
      <span aria-hidden="true" className={thumbnailEmptyVariants({ size, shape })}>
        <ImageOff className={thumbnailIconClass} />
      </span>
    );
  }
  return <img src={src} alt="" loading="lazy" className={thumbnailVariants({ size, shape })} />;
}
