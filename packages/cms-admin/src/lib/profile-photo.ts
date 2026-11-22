/** How large a person's photo is kept: twice the largest circle the editor draws it in. */
const SIDE = 256;
const QUALITY = 0.85;

/**
 * A photo from the person's computer as their profile keeps it: cut to a square from its middle,
 * drawn 256 pixels on a side, as a JPEG in a `data:` address of a few kilobytes. `null` when
 * the browser cannot read the file as a picture.
 */
export async function profilePhoto(file: File): Promise<string | null> {
  let picture: ImageBitmap;
  try {
    picture = await createImageBitmap(file);
  } catch {
    return null;
  }
  const side = Math.min(picture.width, picture.height);
  const canvas = document.createElement('canvas');
  canvas.width = SIDE;
  canvas.height = SIDE;
  const context = canvas.getContext('2d');
  if (!context || side === 0) return null;
  // A JPEG has no see-through parts: without this they would turn black.
  context.fillStyle = '#fff';
  context.fillRect(0, 0, SIDE, SIDE);
  context.drawImage(picture, (picture.width - side) / 2, (picture.height - side) / 2, side, side, 0, 0, SIDE, SIDE);
  picture.close();
  const url = canvas.toDataURL('image/jpeg', QUALITY);
  return url.startsWith('data:image/jpeg;base64,') ? url : null;
}
