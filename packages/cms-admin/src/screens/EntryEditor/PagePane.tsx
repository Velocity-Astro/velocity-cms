import { isSafeLink, type Entry, type EntryData } from '@velocity-astro/cms-core';
import { Button, Dialog, Form, PagePreview, Segmented, TextField } from '@velocity-astro/cms-ui';
import { Maximize2, Monitor, Smartphone, Tablet, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { usePagePreview } from '../../client/queries.js';
import { usePageFocus } from '../../fields/index.js';
import { useLast } from '../../lib/use-closing.js';
import { useEscapes } from '../../lib/use-escapes.js';
import { useMessages } from '../../messages/messages-context.js';

const WIDTHS = ['phone', 'tablet', 'full'] as const;
/** The width of the screen the page is tried at. */
export type PageWidth = (typeof WIDTHS)[number];

export interface PageWidthsProps {
  readonly width: PageWidth;
  readonly onChange: (width: PageWidth) => void;
  /** Each width as its icon alone, named in a tooltip: in the visual editor's bar. */
  readonly isIconOnly?: boolean;
}

/** The choice of the width the page is tried at. */
export function PageWidths({ width, onChange, isIconOnly = false }: PageWidthsProps) {
  const messages = useMessages();
  const labels: Record<PageWidth, string> = { phone: messages.editor.pagePhone, tablet: messages.editor.pageTablet, full: messages.editor.pageDesktop };
  const icons: Record<PageWidth, LucideIcon> = { phone: Smartphone, tablet: Tablet, full: Monitor };
  return (
    <Segmented
      label={messages.editor.pageWidth}
      selected={width}
      onChange={(id) => onChange(WIDTHS.find((candidate) => candidate === id) ?? 'full')}
      options={WIDTHS.map((id) => ({ id, label: labels[id], icon: icons[id] }))}
      areLabelsHidden={isIconOnly}
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
  /** Called when the keys that save are pressed on the page. */
  readonly onSave?: () => void;
  /** Called when a part every page shows (a header, a footer) is pressed on the page: the key of its single page, and the field, as keys. */
  readonly onPartPress?: (key: string, field?: string) => void;
  /** Other entries tried on the page along with this one and not saved: the site's settings, while their colours are chosen. */
  readonly also?: readonly { readonly id: string; readonly data: EntryData }[];
}

/** How long a link to the page is used, in milliseconds, before a newer one to the same page takes its place. A link lasts an hour. */
const LINK_KEPT_MS = 20 * 60_000;
/** The page a link leads to, without what proves the link. */
const pageOf = (path: string) => path.split('?')[0];

/**
 * The entry's page beside its form, drawn by the site from what the form holds now. Nothing is
 * saved to show it: the draft goes with the request for the page and is kept nowhere.
 */
export function PagePane({ entry, data, title, width, onWidthChange, isWhole, onWhole, onFormWanted, onPartPress, onUndo, onRedo, onSave, also = [] }: PagePaneProps) {
  const messages = useMessages();
  const escapes = useEscapes();
  const focus = usePageFocus();
  const link = usePagePreview(entry?.id, entry?.revision);
  // Every save brings a new link, nearly always to the page already shown. The page is drawn again
  // for it only when it leads somewhere else, or when the link in use is getting old.
  const [shown, setShown] = useState<{ readonly path: string; readonly at: number } | null>(null);
  const offered = link.data?.path;
  if (offered !== undefined && offered !== shown?.path && (shown === null || pageOf(offered) !== pageOf(shown.path) || Date.now() - shown.at > LINK_KEPT_MS)) {
    setShown({ path: offered, at: Date.now() });
  }
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
        {...(entry !== null && shown !== null && { address: shown.path })}
        draft={entry === null ? '' : JSON.stringify({ id: entry.id, data, ...(also.length > 0 && { with: also }) })}
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
        {...(onPartPress && { onPartPress })}
        {...(onUndo && { onUndo })}
        {...(onRedo && { onRedo })}
        {...(onSave && { onSave })}
        escapes={escapes}
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
          onSectionSlot: focus.slotted,
          ...(focus.tools !== undefined && { tools: focus.tools }),
        })}
        {...(focus?.opened !== undefined && { shownSectionId: focus.opened, shownAt: focus.openedAt })}
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
