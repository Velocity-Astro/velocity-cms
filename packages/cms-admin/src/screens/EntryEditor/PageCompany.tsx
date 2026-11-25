import { useEffect } from 'react';
import { usePageFocus } from '../../fields/index.js';

export interface PageCompanyProps {
  /** Who else is working in which section now: for a section's id, words that say who. */
  readonly company: Readonly<Record<string, string>>;
  /** Called with the section this person turned to, in the form or on the page. */
  readonly onSection: (id: string) => void;
}

/**
 * Tells the page beside the form, and the form's own list of sections, who else is working in
 * which section, and tells the entry's form which section this person is in. It draws nothing.
 */
export function PageCompany({ company, onSection }: PageCompanyProps) {
  const focus = usePageFocus();
  const said = JSON.stringify(company);
  const setCompany = focus?.setCompany;
  useEffect(() => setCompany?.(JSON.parse(said) as Record<string, string>), [setCompany, said]);
  const opened = focus?.opened;
  const openedAt = focus?.openedAt;
  useEffect(() => {
    if (opened !== undefined) onSection(opened);
    // `onSection` is read as it is when a section is opened.
  }, [opened, openedAt]);
  const pressed = focus?.pressed;
  useEffect(() => {
    if (pressed) onSection(pressed.id);
  }, [pressed]);
  return null;
}
