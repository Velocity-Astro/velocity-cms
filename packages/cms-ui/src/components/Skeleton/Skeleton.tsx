import type { ReactNode } from 'react';
import { skeletonGroupClass, skeletonLabelClass, skeletonVariants, type SkeletonVariants } from './Skeleton.variants.js';

export type SkeletonProps = SkeletonVariants;

/** A grey shape standing where something will be once it has loaded. Screen readers skip it. */
export function Skeleton({ shape, width }: SkeletonProps) {
  return <span aria-hidden className={skeletonVariants({ shape, width: shape === 'square' ? null : width })} />;
}

export interface SkeletonGroupProps {
  /** What is on its way, such as "Loading listings". Read out by screen readers in place of the shapes. */
  readonly label: string;
  /** The shapes, laid out like what they stand for. */
  readonly children: ReactNode;
}

/** Shapes that stand for one thing being loaded, said once to screen readers. It adds no box of its own. */
export function SkeletonGroup({ label, children }: SkeletonGroupProps) {
  return (
    <div role="status" className={skeletonGroupClass}>
      <span className={skeletonLabelClass}>{label}</span>
      {children}
    </div>
  );
}
