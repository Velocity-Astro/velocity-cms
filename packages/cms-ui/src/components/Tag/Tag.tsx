import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { tagVariants, type TagVariants } from './Tag.variants.js';

export interface TagProps extends TagVariants {
  /** A Lucide icon shown before the words. Decoration only: the words must carry the meaning. */
  readonly icon?: LucideIcon;
  readonly children: ReactNode;
}

/** A short label for a state or a category, such as Draft or Published. */
export function Tag({ icon: Icon, children, ...variants }: TagProps) {
  return (
    <span className={tagVariants(variants)}>
      {Icon && <Icon aria-hidden size={12} />}
      {children}
    </span>
  );
}
