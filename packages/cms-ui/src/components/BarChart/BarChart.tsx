import { useId } from 'react';
import {
  barChartClass,
  barChartColumnBarVariants,
  barChartColumnClass,
  barChartColumnLabelClass,
  barChartColumnTrackClass,
  barChartColumnsClass,
  barChartListClass,
  barChartRowBarHolderClass,
  barChartRowBarVariants,
  barChartRowClass,
  barChartRowLabelClass,
  barChartRowTrackClass,
  barChartRowValueClass,
  barChartRowsClass,
  type BarStep,
} from './BarChart.variants.js';

export interface BarChartBar {
  readonly id: string;
  /** What the bar stands for: "Mon", "Listings". */
  readonly label: string;
  readonly value: number;
  /** The value as it is said: "3 submissions", "$12,000". */
  readonly valueText: string;
}

export interface BarChartProps {
  /** What the chart shows, for screen readers: "Submissions in the last 14 days". */
  readonly label: string;
  readonly bars: readonly BarChartBar[];
  /** `columns` for a run of days or short labels; `rows` for named things, with their values beside them. */
  readonly layout?: 'columns' | 'rows';
  /** The one bar to stand out, such as today. */
  readonly highlightId?: string;
}

/** How far along a bar is, in twentieths of the longest. A value above nothing always shows a sliver. */
const stepOf = (value: number, most: number): BarStep => {
  if (most <= 0 || value <= 0) return 0;
  return Math.min(20, Math.max(1, Math.round((value / most) * 20))) as BarStep;
};

/**
 * Values side by side as bars, as columns or as rows. The bars are a picture: what they show is
 * also a list that screen readers read, each with its value in words.
 */
export function BarChart({ label, bars, layout = 'columns', highlightId }: BarChartProps) {
  const titleId = useId();
  const most = Math.max(0, ...bars.map((bar) => bar.value));
  return (
    <figure className={barChartClass} aria-labelledby={titleId}>
      <figcaption id={titleId} className={barChartListClass}>
        {label}
      </figcaption>
      <ul className={barChartListClass}>
        {bars.map((bar) => (
          <li key={bar.id}>{`${bar.label}: ${bar.valueText}`}</li>
        ))}
      </ul>
      {layout === 'columns' ? (
        <div aria-hidden className={barChartColumnsClass}>
          {bars.map((bar) => (
            <div key={bar.id} className={barChartColumnClass}>
              <div className={barChartColumnTrackClass}>
                <div className={barChartColumnBarVariants({ step: stepOf(bar.value, most), isHighlighted: bar.id === highlightId })} />
              </div>
              <span className={barChartColumnLabelClass}>{bar.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <div aria-hidden className={barChartRowsClass}>
          {bars.map((bar) => (
            <div key={bar.id} className={barChartRowClass}>
              <span className={barChartRowLabelClass}>{bar.label}</span>
              <span className={barChartRowTrackClass}>
                <span className={barChartRowBarHolderClass}>
                  <span className={barChartRowBarVariants({ step: stepOf(bar.value, most), isHighlighted: bar.id === highlightId })} />
                </span>
                <span className={barChartRowValueClass}>{bar.valueText}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </figure>
  );
}
