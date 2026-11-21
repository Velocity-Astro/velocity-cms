/** The mark kept for this tab once it has reloaded for a newer editor, so it reloads once and no more. */
const RELOADED = 'velocity-cms:reloaded-for-update';

const remembered = (): boolean => {
  try {
    return window.sessionStorage.getItem(RELOADED) !== null;
  } catch {
    return false;
  }
};
const remember = (isSet: boolean) => {
  try {
    if (isSet) window.sessionStorage.setItem(RELOADED, '1');
    else window.sessionStorage.removeItem(RELOADED);
  } catch {
    // A browser that keeps nothing for the tab still gets one try again below.
  }
};

/**
 * Loads a part of the editor that is fetched only when it is first needed. A tab opened before the
 * site was updated asks for the file the editor had then, which the update replaced: then the
 * page is loaded again once, with the editor as it is now, rather than breaking the screen. A part
 * that cannot be loaded even so fails as it would have, for the screen's error to say so.
 */
export async function loadFresh<T>(load: () => Promise<T>): Promise<T> {
  try {
    const loaded = await load();
    remember(false);
    return loaded;
  } catch (error) {
    // A connection that dropped for a moment gets a second chance before the page is reloaded.
    try {
      const loaded = await load();
      remember(false);
      return loaded;
    } catch {
      if (remembered()) throw error;
      remember(true);
      window.location.reload();
      // The page is going: nothing more is drawn meanwhile.
      return new Promise<T>(() => undefined);
    }
  }
}
