import type { SiteImage } from '@velocity-astro/cms-core';
import { expect, it } from 'vitest';
import { NEWEST_FIRST, arrangeImages, kindOf } from './arrange-images.js';

const images: SiteImage[] = [
  { name: 'porch', url: '/media/porch.webp', uploadedAt: '2026-11-20T10:00:00.000Z', size: 90_000 },
  { name: 'logo', url: '/_astro/logo.abc.svg' },
  { name: 'kitchen', url: '/media/kitchen.jpg', uploadedAt: '2026-11-22T10:00:00.000Z', size: 120_000 },
  { name: 'hero', url: '/_astro/hero.png?w=640' },
];
const names = (list: SiteImage[]) => list.map((image) => image.name);

it('shows the latest upload first, then the site\'s own images by name', () => {
  expect(names(arrangeImages(images, NEWEST_FIRST))).toEqual(['kitchen', 'porch', 'hero', 'logo']);
  expect(names(arrangeImages(images, { ...NEWEST_FIRST, sort: 'oldest' }))).toEqual(['porch', 'kitchen', 'hero', 'logo']);
  expect(names(arrangeImages(images, { ...NEWEST_FIRST, sort: 'name' }))).toEqual(['hero', 'kitchen', 'logo', 'porch']);
  expect(names(arrangeImages(images, { ...NEWEST_FIRST, sort: 'largest' }))).toEqual(['kitchen', 'porch', 'hero', 'logo']);
});

it('finds by name, by where an image is from and by its kind of file', () => {
  expect(names(arrangeImages(images, { ...NEWEST_FIRST, query: ' KIT ' }))).toEqual(['kitchen']);
  expect(names(arrangeImages(images, { ...NEWEST_FIRST, source: 'site' }))).toEqual(['hero', 'logo']);
  expect(names(arrangeImages(images, { ...NEWEST_FIRST, source: 'uploaded' }))).toEqual(['kitchen', 'porch']);
  expect(names(arrangeImages(images, { ...NEWEST_FIRST, kind: 'png' }))).toEqual(['hero']);
  expect(kindOf({ name: 'x', url: '/a/b' })).toBeNull();
  expect(kindOf({ name: 'x', url: '/a/b.JPEG' })).toBe('jpeg');
});
