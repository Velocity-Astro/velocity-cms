import { expect, it } from 'vitest';
import { PreviewLinks } from './preview.js';

const SECRET = 'a'.repeat(32);

it('accepts its own token until it expires', async () => {
  let time = Date.parse('2026-01-01T00:00:00.000Z');
  const clock = { advance: (ms: number) => void (time += ms) };
  const links = new PreviewLinks(SECRET, { now: () => new Date(time).toISOString() });
  const token = await links.issue(60);
  expect(await links.verify(token)).toBe(true);
  clock.advance(59 * 60_000);
  expect(await links.verify(token)).toBe(true);
  clock.advance(60_000);
  expect(await links.verify(token)).toBe(false);
});

it('refuses a token signed with another secret, changed by hand, or not a token at all', async () => {
  const links = new PreviewLinks(SECRET);
  const token = await links.issue();
  const [expires = '', signature = ''] = token.split('.');
  expect(await new PreviewLinks('b'.repeat(32)).verify(token)).toBe(false);
  expect(await links.verify(`${Number(expires) + 1}.${signature}`)).toBe(false);
  for (const text of ['', 'off', '.', `${expires}.`, `${expires}.zz`, `${token}.extra`, `${expires}.${'0'.repeat(64)}`]) {
    expect(await links.verify(text)).toBe(false);
  }
});

it('refuses a secret too short to be safe', () => {
  expect(() => new PreviewLinks('short')).toThrow(/at least 32 characters/);
});
