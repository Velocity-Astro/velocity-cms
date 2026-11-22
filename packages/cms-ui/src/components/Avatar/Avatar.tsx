import { avatarImageClass, avatarVariants, type AvatarVariants } from './Avatar.variants.js';

export interface AvatarProps extends AvatarVariants {
  /** The person's name. Its first letters stand in while there is no photo. */
  readonly name: string;
  /** Their photo. Left out, their initials are shown. */
  readonly src?: string | undefined;
}

/** The first letters of up to two names: "Maya Ellison" is "ME". */
export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0]?.toUpperCase() ?? '')
    .join('');

/**
 * A person's photo in a circle, or their initials where they have none. It is decoration: their
 * name is written beside it, so it is hidden from screen readers.
 */
export function Avatar({ name, src, size }: AvatarProps) {
  return (
    <span aria-hidden="true" className={avatarVariants({ size })}>
      {src === undefined ? initialsOf(name) : <img src={src} alt="" className={avatarImageClass} />}
    </span>
  );
}
