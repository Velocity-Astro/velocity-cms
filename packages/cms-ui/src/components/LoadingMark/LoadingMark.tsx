import { MARK_LEFT, MARK_RIGHT, MARK_TOP, MARK_VIEW_BOX } from '../Logo/Logo.js';
import {
  loadingMarkClass,
  loadingMarkColourClass,
  loadingMarkGreyClass,
  loadingMarkLabelClass,
  loadingMarkPieceClass,
  loadingMarkSvgClass,
} from './LoadingMark.variants.js';

export interface LoadingMarkProps {
  /** What is happening, such as "Opening the editor". Read out by screen readers; the screen shows only the mark. */
  readonly label: string;
}

const FACETS = [
  { id: 'top', d: MARK_TOP },
  { id: 'left', d: MARK_LEFT },
  { id: 'right', d: MARK_RIGHT },
] as const;

/**
 * The whole screen while the app opens and there is no layout yet to keep: the Velocity mark in the
 * middle, its three facets arriving in grey and taking their colour, again until the app is there.
 */
export function LoadingMark({ label }: LoadingMarkProps) {
  return (
    <div role="status" className={loadingMarkClass}>
      <svg viewBox={MARK_VIEW_BOX} aria-hidden="true" className={loadingMarkSvgClass}>
        {FACETS.map((facet) => (
          <g key={facet.id} className={loadingMarkPieceClass[facet.id]}>
            <path className={loadingMarkGreyClass} d={facet.d} />
            <path className={loadingMarkColourClass[facet.id]} d={facet.d} />
          </g>
        ))}
      </svg>
      <span className={loadingMarkLabelClass}>{label}</span>
    </div>
  );
}
