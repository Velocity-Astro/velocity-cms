import type { Entry, EntryData } from '@velocity-astro/cms-core';
import { PagePreview, Segmented } from '@velocity-astro/cms-ui';
import { useState } from 'react';
import { usePagePreview } from '../../client/queries.js';
import { usePageFocus } from '../../fields/index.js';
import { useMessages } from '../../messages/messages-context.js';

const WIDTHS = ['phone', 'tablet', 'full'] as const;
type Width = (typeof WIDTHS)[number];

export interface PagePaneProps {
  /** The entry as the server has it, or `null` for one that has not been saved yet and so has no page. */
  readonly entry: Entry | null;
  /** What the form holds now. */
  readonly data: EntryData;
  /** What the entry is called, to name the frame. */
  readonly title: string;
}

/**
 * The entry's page beside its form, drawn by the site from what the form holds now. Nothing is
 * saved to show it: the draft goes with the request for the page and is kept nowhere.
 */
export function PagePane({ entry, data, title }: PagePaneProps) {
  const messages = useMessages();
  const focus = usePageFocus();
  const link = usePagePreview(entry?.id, entry?.revision);
  const [width, setWidth] = useState<Width>('full');
  const labels: Record<Width, string> = { phone: messages.editor.pagePhone, tablet: messages.editor.pageTablet, full: messages.editor.pageDesktop };

  const emptyText =
    entry === null
      ? messages.editor.pageNotYet
      : link.error
        ? messages.editor.pageNotShown(link.error.message)
        : messages.editor.pageLoading;

  return (
    <PagePreview
      label={messages.editor.pageFrame(title)}
      {...(entry !== null && link.data && { address: link.data.path })}
      draft={entry === null ? '' : JSON.stringify({ id: entry.id, data })}
      width={width}
      note={messages.editor.pageNote}
      toolbar={
        <Segmented
          label={messages.editor.pageWidth}
          selected={width}
          onChange={(id) => setWidth(WIDTHS.find((candidate) => candidate === id) ?? 'full')}
          options={WIDTHS.map((id) => ({ id, label: labels[id] }))}
        />
      }
      emptyText={emptyText}
      {...(focus && { onSectionPress: focus.press })}
      {...(focus?.opened !== undefined && { shownSectionId: focus.opened })}
    />
  );
}
