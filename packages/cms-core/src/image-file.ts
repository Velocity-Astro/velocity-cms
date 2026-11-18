/** What an image file says about itself in its first bytes. */
export interface ImageFacts {
  readonly contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  /** The ending a file of this kind carries, without the dot. */
  readonly extension: 'jpg' | 'png' | 'webp';
  readonly width: number;
  readonly height: number;
}

const ascii = (bytes: Uint8Array, at: number, text: string): boolean =>
  [...text].every((letter, index) => bytes[at + index] === letter.charCodeAt(0));
const be16 = (bytes: Uint8Array, at: number): number => ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0);
const be32 = (bytes: Uint8Array, at: number): number => be16(bytes, at) * 0x10000 + be16(bytes, at + 2);
const le16 = (bytes: Uint8Array, at: number): number => (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8);
const le24 = (bytes: Uint8Array, at: number): number => le16(bytes, at) | ((bytes[at + 2] ?? 0) << 16);

function png(bytes: Uint8Array): ImageFacts | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || !signature.every((byte, index) => bytes[index] === byte) || !ascii(bytes, 12, 'IHDR')) return null;
  return { contentType: 'image/png', extension: 'png', width: be32(bytes, 16), height: be32(bytes, 20) };
}

function jpeg(bytes: Uint8Array): ImageFacts | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1] ?? 0;
    // Padding, and the markers that stand alone.
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    // A frame header holds the size. 0xC4, 0xC8 and 0xCC share its range but are other things.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { contentType: 'image/jpeg', extension: 'jpg', width: be16(bytes, at + 7), height: be16(bytes, at + 5) };
    }
    // The picture itself starts, and no frame header came before it.
    if (marker === 0xda || marker === 0xd9) return null;
    at += 2 + be16(bytes, at + 2);
  }
  return null;
}

function webp(bytes: Uint8Array): ImageFacts | null {
  if (bytes.length < 30 || !ascii(bytes, 0, 'RIFF') || !ascii(bytes, 8, 'WEBP')) return null;
  const facts = (width: number, height: number): ImageFacts => ({ contentType: 'image/webp', extension: 'webp', width, height });
  if (ascii(bytes, 12, 'VP8X')) return facts(le24(bytes, 24) + 1, le24(bytes, 27) + 1);
  if (ascii(bytes, 12, 'VP8 ')) return facts(le16(bytes, 26) & 0x3fff, le16(bytes, 28) & 0x3fff);
  if (ascii(bytes, 12, 'VP8L') && bytes[20] === 0x2f) {
    const bits = le16(bytes, 21) + le16(bytes, 23) * 0x10000;
    return facts((bits & 0x3fff) + 1, (Math.floor(bits / 0x4000) & 0x3fff) + 1);
  }
  return null;
}

/**
 * Reads what kind of image a file is and how large, from the file itself. The name and the
 * content type a browser sends are whatever the sender says, so neither is believed.
 * Answers `null` for anything that is not a JPEG, PNG or WebP with a size.
 */
export function readImage(bytes: Uint8Array): ImageFacts | null {
  const facts = png(bytes) ?? jpeg(bytes) ?? webp(bytes);
  return facts && facts.width > 0 && facts.height > 0 ? facts : null;
}
