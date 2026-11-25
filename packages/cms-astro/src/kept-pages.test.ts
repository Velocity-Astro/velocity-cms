import { expect, it, vi } from 'vitest';
import { clearKeptPages } from './kept-pages.js';

it('clears the pages kept under the tags it is given', async () => {
  const invalidate = vi.fn(async () => undefined);
  await clearKeptPages({ invalidate }, ['cms']);
  expect(invalidate).toHaveBeenCalledWith({ tags: ['cms'] });
});

it('passes over a runtime with no cache to clear, and says so once', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const cache = { invalidate: async () => { throw new TypeError('cache.purge is not a function'); } };
  await clearKeptPages(cache, ['cms']);
  await clearKeptPages(cache, ['cms']);
  expect(warn).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});

it('lets every other refusal be heard', async () => {
  await expect(clearKeptPages({ invalidate: async () => { throw new Error('The cache could not be reached.'); } }, ['cms'])).rejects.toThrow('could not be reached');
  await expect(clearKeptPages({ invalidate: async () => { throw new TypeError('fetch failed'); } }, ['cms'])).rejects.toThrow('fetch failed');
});
