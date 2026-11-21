import { Outline, type OutlineItem } from '@velocity-astro/cms-ui';
import { useEffect, useState } from 'react';
import { usePageFocus } from '../../fields/page-focus.js';
import { useMessages } from '../../messages/messages-context.js';

export interface SectionOutlineProps {
  /** Called when a section is chosen, so the form, where it is edited, is shown. */
  readonly onChosen: () => void;
}

/**
 * The page's sections by name, beside the page in the visual editor. Choosing one opens it in the
 * form and brings it into view on the page, as pressing it on the page does. It changes nothing:
 * the names and their order are what the field that holds the page says it has (`tools`).
 */
export function SectionOutline({ onChosen }: SectionOutlineProps) {
  const messages = useMessages();
  const focus = usePageFocus();
  const sections = focus?.tools?.sections ?? {};
  // A section inside another is set in under it: one step for each section it is inside.
  const depthOf = (id: string, seen: number = 0): number => {
    const list = sections[id]?.list ?? '';
    if (list === '' || seen > 3) return seen;
    const [holder = ''] = list.split(':');
    return depthOf(holder, seen + 1);
  };
  const items: OutlineItem[] = Object.entries(sections).map(([id, section]) => ({
    id,
    label: section.name,
    depth: Math.min(depthOf(id), 3) as 0 | 1 | 2 | 3,
  }));
  // The section looked at last: opened in the form, or pressed on the page, whichever came later.
  const [current, setCurrent] = useState<string | undefined>(undefined);
  const opened = focus?.opened;
  const pressed = focus?.pressed;
  useEffect(() => {
    if (opened !== undefined) setCurrent(opened);
  }, [opened]);
  useEffect(() => {
    if (pressed !== undefined) setCurrent(pressed.id);
  }, [pressed]);
  return (
    <Outline
      title={messages.editor.outlineTitle}
      emptyText={messages.editor.outlineEmpty}
      items={items}
      {...(current !== undefined && current in sections && { currentId: current })}
      onChoose={(id) => {
        setCurrent(id);
        focus?.open(id);
        onChosen();
      }}
    />
  );
}
