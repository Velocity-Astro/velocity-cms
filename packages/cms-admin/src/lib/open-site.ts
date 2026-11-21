/**
 * Opens a page of the site itself, as visitors see it, in a new tab. The editor's own links stay
 * inside the editor, so the site is reached from its top.
 */
export function openSite(address = '/'): void {
  window.open(new URL(address, window.location.origin).href, '_blank', 'noopener');
}
