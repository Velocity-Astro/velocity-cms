import { Label, Meter as AriaMeter } from 'react-aria-components';
import { meterClass, meterFillVariants, meterHeadClass, meterLabelClass, meterTrackClass, meterValueClass, type MeterStep } from './Meter.variants.js';

export interface MeterProps {
  /** What is measured: "November target". */
  readonly label: string;
  /** How far along it is. Past `max`, the bar is full. */
  readonly value: number;
  /** What counts as all of it. */
  readonly max: number;
  /** How far along, in words, at the end of the line and read out: "69% of $20,000". */
  readonly valueText: string;
}

/** How far something is toward a whole, as a bar with its words above it. */
export function Meter({ label, value, max, valueText }: MeterProps) {
  return (
    <AriaMeter className={meterClass} value={Math.min(value, max)} minValue={0} maxValue={max} valueLabel={valueText}>
      {({ percentage, valueText: said }) => (
        <>
          <span className={meterHeadClass}>
            <Label className={meterLabelClass}>{label}</Label>
            <span className={meterValueClass}>{said}</span>
          </span>
          <span className={meterTrackClass}>
            <span className={meterFillVariants({ step: Math.min(20, Math.max(0, Math.round(percentage / 5))) as MeterStep })} />
          </span>
        </>
      )}
    </AriaMeter>
  );
}
