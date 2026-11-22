import { expect, it } from 'vitest';
import { folderImages } from './site-images.js';

const files = {
  '/src/assets/photos/porch.jpg': { src: '/_astro/porch.abc.jpg', width: 1600, height: 900 },
  '/src/assets/photos/room.kitchen.webp': { src: '/_astro/kitchen.def.webp', width: 1200, height: 800 },
};

it('calls an image by its file name without the ending', async () => {
  expect(await folderImages(files).list()).toEqual([
    { name: 'porch', url: '/_astro/porch.abc.jpg', width: 1600, height: 900 },
    { name: 'room.kitchen', url: '/_astro/kitchen.def.webp', width: 1200, height: 800 },
  ]);
});

it('shows a small copy where one can be made, and the image itself where it cannot', async () => {
  let made = 0;
  const library = folderImages(files, async (file) => {
    made += 1;
    if (file.width === 1200) throw new Error('no image service');
    return `/_image?href=${file.src}&w=480`;
  });
  expect((await library.list()).map((image) => image.url)).toEqual(['/_image?href=/_astro/porch.abc.jpg&w=480', '/_astro/kitchen.def.webp']);
  await library.list();
  expect(made).toBe(2);
});

it('takes images from the folders inside the folder, one image to a name', async () => {
  const nested = {
    '/src/assets/showcase/studio.png': { src: '/_astro/studio.b.png', width: 1200, height: 800 },
    '/src/assets/hero.jpg': { src: '/_astro/hero.a.jpg', width: 1600, height: 900 },
    '/src/assets/templates/agency/studio.jpg': { src: '/_astro/studio.c.jpg', width: 800, height: 600 },
  };
  expect(await folderImages(nested).list()).toEqual([
    { name: 'hero', url: '/_astro/hero.a.jpg', width: 1600, height: 900 },
    { name: 'studio', url: '/_astro/studio.b.png', width: 1200, height: 800 },
  ]);
});
