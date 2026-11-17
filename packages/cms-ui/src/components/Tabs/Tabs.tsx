import type { ReactNode } from 'react';
import { Tab, TabList, TabPanel, Tabs as AriaTabs } from 'react-aria-components';
import { tabClass, tabListClass, tabPanelClass, tabsClass } from './Tabs.variants.js';

export interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly content: ReactNode;
  readonly isDisabled?: boolean;
}

export interface TabsProps {
  /** Names the set of tabs for screen readers, such as "Listing sections". */
  readonly label: string;
  readonly tabs: readonly TabItem[];
  /** The id of the tab that is showing. */
  readonly selected?: string;
  readonly defaultSelected?: string;
  readonly onChange?: (id: string) => void;
}

/** Views of the same thing, one shown at a time. */
export function Tabs({ label, tabs, selected, defaultSelected, onChange }: TabsProps) {
  return (
    <AriaTabs
      className={tabsClass}
      {...(selected !== undefined && { selectedKey: selected })}
      {...(defaultSelected !== undefined && { defaultSelectedKey: defaultSelected })}
      {...(onChange && { onSelectionChange: (key) => onChange(String(key)) })}
    >
      <TabList aria-label={label} className={tabListClass}>
        {tabs.map((tab) => (
          <Tab key={tab.id} id={tab.id} className={tabClass} isDisabled={tab.isDisabled ?? false}>
            {tab.label}
          </Tab>
        ))}
      </TabList>
      {tabs.map((tab) => (
        <TabPanel key={tab.id} id={tab.id} className={tabPanelClass}>
          {tab.content}
        </TabPanel>
      ))}
    </AriaTabs>
  );
}
