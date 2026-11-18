import { Switch as AriaSwitch } from 'react-aria-components';
import { switchClass, switchHiddenLabelClass, switchThumbClass, switchTrackClass } from './Switch.variants.js';

export interface SwitchProps {
  /** Names the setting, not the state: "Show on homepage". */
  readonly label: string;
  /** Hides the label from sight, where what is beside the switch already says what it turns on. It still names the switch. */
  readonly isLabelHidden?: boolean;
  readonly isSelected?: boolean;
  readonly defaultSelected?: boolean;
  readonly onChange?: (isSelected: boolean) => void;
  readonly isDisabled?: boolean;
  readonly name?: string;
}

/** A setting that is on or off, and takes effect at once. */
export function Switch({ label, isLabelHidden = false, isSelected, defaultSelected, onChange, isDisabled = false, name }: SwitchProps) {
  return (
    <AriaSwitch
      className={switchClass}
      isDisabled={isDisabled}
      {...(isSelected !== undefined && { isSelected })}
      {...(defaultSelected !== undefined && { defaultSelected })}
      {...(onChange && { onChange })}
      {...(name !== undefined && { name })}
    >
      <span className={switchTrackClass}>
        <span className={switchThumbClass} />
      </span>
      {isLabelHidden ? <span className={switchHiddenLabelClass}>{label}</span> : label}
    </AriaSwitch>
  );
}
