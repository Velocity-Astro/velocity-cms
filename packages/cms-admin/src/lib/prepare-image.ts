import { readImage, type NewUpload } from '@velocity/cms-core';

/** No page shows a photo wider than this, and a phone's camera makes them twice as wide. */
const LONGEST_SIDE = 2560;
const JPEG_QUALITY = 0.86;

const withEnding = (fileName: string, ending: string): string => `${fileName.replace(/\.[^.]*$/, '')}.${ending}`;

function drawn(picture: ImageBitmap, scale: number, type: 'image/jpeg' | 'image/png'): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(picture.width * scale));
  canvas.height = Math.max(1, Math.round(picture.height * scale));
  const context = canvas.getContext('2d');
  if (!context) return Promise.resolve(null);
  if (type === 'image/jpeg') {
    // A JPEG has no see-through parts: without this they would turn black.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(picture, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, type, JPEG_QUALITY));
}

/**
 * Gets a file from the person's computer ready to send. A photo that is larger than a page
 * ever shows, heavier than the site takes, or in a format the site does not keep (a phone's
 * HEIC, where the browser can read it) is drawn again smaller, here in the browser, so a
 * 12 MB photo from a phone simply works. Anything else is sent as it is, and the server decides.
 *
 * @param maxBytes The largest file the site takes.
 */
export async function prepareImage(file: File, maxBytes: number): Promise<NewUpload> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const asIs: NewUpload = { fileName: file.name, bytes };
  const facts = readImage(bytes);
  const fits = facts !== null && Math.max(facts.width, facts.height) <= LONGEST_SIDE && bytes.length <= maxBytes;
  if (fits || typeof createImageBitmap !== 'function') return asIs;

  const picture = await createImageBitmap(file).catch(() => null);
  if (!picture) return asIs;
  try {
    const scale = Math.min(1, LONGEST_SIDE / Math.max(picture.width, picture.height));
    // A PNG stays a PNG, since it may have see-through parts. Everything else becomes a JPEG.
    const type = facts?.contentType === 'image/png' ? 'image/png' : 'image/jpeg';
    const smaller = await drawn(picture, scale, type);
    if (!smaller) return asIs;
    return { fileName: withEnding(file.name, type === 'image/png' ? 'png' : 'jpg'), bytes: new Uint8Array(await smaller.arrayBuffer()) };
  } finally {
    picture.close();
  }
}
