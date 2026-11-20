import { isSafeLink, type Entry, type EntryData } from '@velocity-astro/cms-core';
import { Button, Dialog, Form, PagePreview, Segmented, TextField } from '@velocity-astro/cms-ui';
import { Maximize2 } from 'lucide-react';
import { useState } from 'react';
import { usePagePreview } from '../../client/queries.js';
import { usePageFocus } from '../../fields/index.js';
import { useLast } from '../../lib/use-closing.js';
import { useMessages } from '../../messages/messages-context.js';

const WIDTHS = ['phone', 'tablet', 'full'] as const;
/** The width of the screen the page is tried at. */
export type PageWidth = (typeof WIDTHS)[number];

export interface PageWidthsProps {
  readonly width: PageWidth;
  readonly onChange: (width: PageWidth) => void;
}

/** The choice of the width the page is tried at. */
export function PageWidths({ width, onChange }: PageWidthsProps) {
  const messages = useMessages();
  const labels: Record<PageWidth, string> = { phone: messages.editor.pagePhone, tablet: messages.editor.pageTablet, full: messages.editor.pageDesktop };
  return (
    <Segmented
      label={messages.editor.pageWidth}
      selected={width}
      onChange={(id) => onChange(WIDTHS.find((candidate) => candidate === id) ?? 'full')}
      options={WIDTHS.map((id) => ({ id, label: labels[id] }))}
    />
  );
}

export interface PagePaneProps {
  /** The entry as the server has it, or `null` for one that has not been saved yet and so has no page. */
  readonly entry: Entry | null;
  /** What the form holds now. */
  readonly data: EntryData;
  /** What the entry is called, to name the frame. */
  readonly title: string;
  readonly width: PageWidth;
  readonly onWidthChange: (width: PageWidth) => void;
  /** The page has the whole window: the bar across the window holds its controls, and it needs no frame. */
  readonly isWhole: boolean;
  /** Called when the person asks for the page in the whole window. */
  readonly onWhole: () => void;
  /** Called when something pressed on the page is edited in the form and nowhere else, so the form is wanted. */
  readonly onFormWanted: () => void;
  /** Called when the keys that take a change back, or make it again, are pressed on the page. */
  readonly onUndo?: () => void;
  readonly onRedo?: () => void;
}

/**
 * The entry's page beside its form, drawn by the site from what the form holds now. Nothing is
 * saved to show it: the draft goes with the request for the page and is kept nowhere.
 */
export function PagePane({ entry, data, title, width, onWidthChange, isWhole, onWhole, onFormWanted, onUndo, onRedo }: PagePaneProps) {
  const messages = useMessages();
  const focus = usePageFocus();
  const link = usePagePreview(entry?.id, entry?.revision);
  // Where a link in text written on the page should lead, while the person is asked.
  const [asked, setAsked] = useState<{ readonly href: string; readonly typed: string; readonly answer: (href: string | null) => void } | null>(null);
  const shownAsked = useLast(asked);
  const answer = (href: string | null) => {
    asked?.answer(href);
    setAsked(null);
  };
  const typedLink = (shownAsked?.typed ?? '').trim();
  const isWrong = typedLink !== '' && !isSafeLink(typedLink);

  const emptyText =
    entry === null
      ? messages.editor.pageNotYet
      : link.error
        ? messages.editor.pageNotShown(link.error.message)
        : messages.editor.pageLoading;

  return (
    <>
      <PagePreview
        label={messages.editor.pageFrame(title)}
        {...(entry !== null && link.data && { address: link.data.path })}
        draft={entry === null ? '' : JSON.stringify({ id: entry.id, data })}
        width={width}
        isBare={isWhole}
        {...(!isWhole && {
          action: (
            <Button variant="secondary" size="sm" icon={Maximize2} isDisabled={entry === null} onPress={onWhole}>
              {messages.editor.visualOpen}
            </Button>
          ),
          toolbar: <PageWidths width={width} onChange={onWidthChange} />,
        })}
        emptyText={emptyText}
        {...(onUndo && { onUndo })}
        {...(onRedo && { onRedo })}
        {...(focus && {
          onSectionPress: (id: string, field?: string, inForm?: boolean) => {
            focus.press(id, field);
            // Words that can be typed on the page are typed there. Anything else is edited in the form.
            if (inForm === true || field === undefined || focus.typable[id]?.includes(field) !== true) onFormWanted();
          },
          onTextLink: (href: string, answer: (href: string | null) => void) => setAsked({ href, typed: href, answer }),
          typable: focus.typable,
          onWords: focus.typed,
          onSectionAction: focus.acted,
          onSectionMove: focus.dragged,
          onSectionPicture: focus.pictured,
          onSectionLink: focus.linked,
          onSectionItem: focus.itemActed,
          onSectionSwatch: focus.swatched,
          ...(focus.tools !== undefined && { tools: focus.tools }),
        })}
        {...(focus?.opened !== undefined && { shownSectionId: focus.opened })}
      />
      <Dialog
        isOpen={asked !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) answer(null);
        }}
        title={messages.editor.richText.link}
        closeLabel={messages.editor.close}
        size="sm"
        footer={
          <>
            {shownAsked?.href !== '' && (
              <Button variant="secondary" onPress={() => answer('')}>
                {messages.editor.richText.linkRemove}
              </Button>
            )}
            <Button isDisabled={typedLink === '' || isWrong} onPress={() => answer(typedLink)}>
              {messages.editor.richText.linkApply}
            </Button>
          </>
        }
      >
        <Form
          label={messages.editor.richText.link}
          onSubmit={() => {
            if (typedLink !== '' && !isWrong) answer(typedLink);
          }}
        >
          <TextField
            label={messages.editor.richText.linkAddress}
            description={messages.editor.richText.linkHelp}
            value={shownAsked?.typed ?? ''}
            onChange={(typed) => setAsked((last) => (last ? { ...last, typed } : last))}
            autoFocus
            {...(isWrong && { errorMessage: messages.editor.pageTextLinkProblem })}
          />
        </Form>
      </Dialog>
    </>
  );
}
