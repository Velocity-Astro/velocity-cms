import type { LucideIcon } from 'lucide-react';
import { Header, ListBox, ListBoxItem, ListBoxSection } from 'react-aria-components';
import { Dialog } from '../../components/Dialog/index.js';
import {
  optionPickerDescriptionClass,
  optionPickerEmptyClass,
  optionPickerGroupClass,
  optionPickerGroupLabelClass,
  optionPickerIconClass,
  optionPickerIconSize,
  optionPickerLabelClass,
  optionPickerListClass,
  optionPickerOptionClass,
  optionPickerTextClass,
} from './OptionPicker.variants.js';

export interface PickerOption {
  readonly id: string;
  readonly label: string;
  /** A line on what choosing it gives. */
  readonly description?: string;
  readonly icon?: LucideIcon;
}

export interface PickerGroup {
  readonly id: string;
  /** The name over the group: "Content". */
  readonly label: string;
  readonly options: readonly PickerOption[];
}

export interface OptionPickerProps {
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  /** Called once the picker has closed and left the page. */
  readonly onClosed?: () => void;
  /** What is being chosen: "Add a section". */
  readonly title: string;
  readonly closeLabel: string;
  readonly groups: readonly PickerGroup[];
  /** Called with the id of the option chosen. The picker asks to close afterwards. */
  readonly onChoose: (id: string) => void;
  /** Shown when there is nothing to choose from. */
  readonly emptyText: string;
}

/** A window to choose one thing from a set of named kinds, in groups. Choosing closes it. */
export function OptionPicker({ isOpen, onOpenChange, onClosed, title, closeLabel, groups, onChoose, emptyText }: OptionPickerProps) {
  const filled = groups.filter((group) => group.options.length > 0);
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} {...(onClosed !== undefined && { onClosed })} title={title} closeLabel={closeLabel} size="md">
      {filled.length === 0 ? (
        <p className={optionPickerEmptyClass}>{emptyText}</p>
      ) : (
        <ListBox
          aria-label={title}
          autoFocus="first"
          selectionMode="none"
          className={optionPickerListClass}
          onAction={(key) => {
            onChoose(String(key));
            onOpenChange(false);
          }}
        >
          {filled.map((group) => (
            <ListBoxSection key={group.id} id={`group:${group.id}`} className={optionPickerGroupClass}>
              <Header className={optionPickerGroupLabelClass}>{group.label}</Header>
              {group.options.map(({ id, label, description, icon: Icon }) => (
                <ListBoxItem key={id} id={id} textValue={description === undefined ? label : `${label} ${description}`} className={optionPickerOptionClass}>
                  {Icon && (
                    <span className={optionPickerIconClass}>
                      <Icon aria-hidden size={optionPickerIconSize} />
                    </span>
                  )}
                  <span className={optionPickerTextClass}>
                    {/* Both lines are the option's name, so what is read out is what is seen. */}
                    <span className={optionPickerLabelClass}>{label}</span>
                    {description !== undefined && <span className={optionPickerDescriptionClass}>{description}</span>}
                  </span>
                </ListBoxItem>
              ))}
            </ListBoxSection>
          ))}
        </ListBox>
      )}
    </Dialog>
  );
}
