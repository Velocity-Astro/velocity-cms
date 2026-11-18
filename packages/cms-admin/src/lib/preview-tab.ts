/** A tab opened for a preview before its address is known. */
export interface PreviewTab {
  /** Shows a page of this site in the tab. Anything but a path on this site is refused. */
  readonly show: (path: string) => void;
  /** Closes the tab, when there turned out to be nothing to show. */
  readonly close: () => void;
}

const isOwnPath = (path: string): boolean => path.startsWith('/') && !path.startsWith('//');

/**
 * Opens an empty tab now, to be given its address later. A browser lets a page open a tab only
 * while it is answering a click, and the address of a preview is known a moment after: the draft
 * is saved first. When the browser refuses the tab, the preview takes this one.
 */
export function openPreviewTab(): PreviewTab {
  const tab = window.open('', '_blank');
  return {
    show: (path) => {
      if (!isOwnPath(path)) {
        tab?.close();
        return;
      }
      const address = new URL(path, window.location.origin).href;
      if (tab) tab.location.href = address;
      else window.location.assign(address);
    },
    close: () => tab?.close(),
  };
}
