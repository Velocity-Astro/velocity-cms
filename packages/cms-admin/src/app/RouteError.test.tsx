import { screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { renderApp } from '../testing/render-app.js';
import { sampleContentTypes, sampleEntries, sampleUser } from '../testing/sample-content.js';
import { loadFresh } from '../lib/load-fresh.js';

const signedIn = { user: sampleUser, contentTypes: sampleContentTypes, entries: sampleEntries() };

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

it('says there is no screen at an address the editor does not know, inside the frame', async () => {
  renderApp('/nowhere/at-all', signedIn);
  expect(await screen.findByText('There is no screen at this address. Choose one from the menu.')).toBeTruthy();
  expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
});

it('loads a part fetched later again once, then reloads the page once, for a tab opened before an update', async () => {
  const reload = vi.fn();
  vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload });
  let tries = 0;
  const failing = () => {
    tries += 1;
    return Promise.reject(new TypeError('Failed to fetch dynamically imported module'));
  };
  void loadFresh(failing);
  await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
  expect(tries).toBe(2);
  // Reloaded once already: the next failure is the screen's to show, not another reload.
  await expect(loadFresh(failing)).rejects.toThrow('Failed to fetch dynamically imported module');
  expect(reload).toHaveBeenCalledOnce();
  // A part that loads clears the mark, so a later update reloads again.
  expect(await loadFresh(() => Promise.resolve('ok'))).toBe('ok');
  expect(window.sessionStorage.length).toBe(0);
});
