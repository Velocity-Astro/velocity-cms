import { statClass, statDetailClass, statLabelClass, statValueClass } from './Stat.variants.js';

export interface StatProps {
  /** What is counted, such as "Drafts". */
  readonly label: string;
  /** The figure, already formatted: "12". */
  readonly value: string;
  /** A few words under the figure, such as "waiting to be published". */
  readonly detail?: string;
}

/** One figure with what it counts, for the top of a dashboard. */
export function Stat({ label, value, detail }: StatProps) {
  return (
    <div role="group" aria-label={label} className={statClass}>
      <span aria-hidden className={statLabelClass}>
        {label}
      </span>
      <span className={statValueClass}>{value}</span>
      {detail !== undefined && <span className={statDetailClass}>{detail}</span>}
    </div>
  );
}
