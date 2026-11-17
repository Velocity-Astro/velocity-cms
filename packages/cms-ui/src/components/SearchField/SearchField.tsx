import { Search, X } from 'lucide-react';
import { Button, Input, SearchField as AriaSearchField } from 'react-aria-components';
import {
  searchFieldClass,
  searchFieldClearClass,
  searchFieldIconClass,
  searchFieldIconSize,
  searchFieldInputClass,
} from './SearchField.variants.js';

export interface SearchFieldProps {
  /** What is searched, for screen readers, such as "Search listings". The icon stands for it on screen. */
  readonly label: string;
  /** An example of what to type, such as "Search by title". */
  readonly placeholder?: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Names the button that empties the field, such as "Clear search". */
  readonly clearLabel: string;
}

/** A box for narrowing down a list by typing. Escape, or its button, empties it. */
export function SearchField({ label, placeholder, value, onChange, clearLabel }: SearchFieldProps) {
  return (
    <AriaSearchField aria-label={label} className={searchFieldClass} value={value} onChange={onChange}>
      <Search aria-hidden size={searchFieldIconSize} className={searchFieldIconClass} />
      <Input className={searchFieldInputClass} {...(placeholder !== undefined && { placeholder })} />
      <Button aria-label={clearLabel} className={searchFieldClearClass}>
        <X aria-hidden size={searchFieldIconSize} />
      </Button>
    </AriaSearchField>
  );
}
