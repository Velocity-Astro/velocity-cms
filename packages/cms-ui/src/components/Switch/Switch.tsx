import { Switch as AriaSwitch } from 'react-aria-components';
import { switchClass, switchThumbClass, switchTrackClass } from './Switch.variants.js';

export interface SwitchProps {
  /** Always shown. Names the setting, not the state: "Show on homepage". */
  readonly label: string;
  readonly isSelected?: boolean;
  readonly defaultSelected?: boolean;
  readonly onChange?: (isSelected: boolean) => void;
  readonly isDisabled?: boolean;
  readonly name?: string;
}

/** A setting that is on or off, and takes effect at once. */
export function Switch({ label, isSelected, defaultSelected, onChange, isDisabled = false, name }: SwitchProps) {
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
      {label}
    </AriaSwitch>
  );
}
