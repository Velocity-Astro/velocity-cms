import { LoaderCircle } from 'lucide-react';
import { spinnerHiddenLabelClass, spinnerIconClass, spinnerIconSize, spinnerVariants, type SpinnerVariants } from './Spinner.variants.js';

export interface SpinnerProps extends SpinnerVariants {
  /** What is happening, such as "Loading listings". Always read out by screen readers. */
  readonly label: string;
  /** Shows the label beside the spinner as well. */
  readonly showLabel?: boolean;
}

/** Says that something is on its way. */
export function Spinner({ label, showLabel = false, size }: SpinnerProps) {
  return (
    <span role="status" className={spinnerVariants({ size })}>
      <LoaderCircle aria-hidden size={spinnerIconSize[size ?? 'md']} className={spinnerIconClass} />
      <span className={showLabel ? undefined : spinnerHiddenLabelClass}>{label}</span>
    </span>
  );
}
