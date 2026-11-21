import { expect, it } from 'vitest';
import { isSaveKey } from './use-save-key.js';

const key = (key: string, held: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({ key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...held });

it('takes Ctrl or Command with S as the keys that save, and nothing else', () => {
  expect(isSaveKey(key('s', { ctrlKey: true }))).toBe(true);
  expect(isSaveKey(key('S', { metaKey: true }))).toBe(true);
  expect(isSaveKey(key('s'))).toBe(false);
  expect(isSaveKey(key('s', { ctrlKey: true, shiftKey: true }))).toBe(false);
  expect(isSaveKey(key('s', { ctrlKey: true, altKey: true }))).toBe(false);
  expect(isSaveKey(key('z', { ctrlKey: true }))).toBe(false);
});
