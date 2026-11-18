import type { ImageLibrary, SiteImage } from '@velocity/cms-core';

/** An image file as the site's bundler describes it. */
export interface ImageFile {
  readonly src: string;
  readonly width: number;
  readonly height: number;
}

/** The file's name without its folder or its ending: `/src/assets/photos/porch.jpg` is `porch`. */
const nameOf = (file: string): string => file.slice(file.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');

/**
 * The images in a folder of the project, for image fields to choose from. An image is called by
 * its file name without the ending, which is how a template's pages look their images up.
 *
 * @param files The folder's images by path, as `import.meta.glob` gives them.
 * @param small Makes the address of a small copy, for the editor to show. When it fails for an
 *   image, the editor loads the image itself.
 */
export function folderImages(files: Readonly<Record<string, ImageFile>>, small?: (file: ImageFile) => Promise<string>): ImageLibrary {
  let listed: Promise<readonly SiteImage[]> | undefined;
  const list = (): Promise<readonly SiteImage[]> =>
    Promise.all(
      Object.entries(files).map(async ([path, file]) => ({
        name: nameOf(path),
        url: small ? await small(file).catch(() => file.src) : file.src,
        width: file.width,
        height: file.height,
      })),
    );
  // The folder changes only with a deploy, so it is read once.
  return { list: () => (listed ??= list()) };
}
