/**
 * Sends the browser out of the editor, to an address the server made: back to an app that
 * asked to be connected. The editor's own screens are reached with `useGo`.
 */
export const leave = {
  to(address: string): void {
    window.location.assign(address);
  },
};
