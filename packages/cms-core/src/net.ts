/**
 * Whether a numeric address is one only this machine or its own network can reach: this machine,
 * a private network, a link between neighbours, a cloud's own metadata address. Something an
 * owner types into settings must never be a way to reach those. Anything that cannot be read as
 * an address counts as private, so a doubt refuses.
 */
export function isPrivateAddress(address: string): boolean {
  const text = address.trim().toLowerCase().replace(/^\[|\]$/g, '');
  const four = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (four) {
    const [a, b] = [Number(four[1]), Number(four[2])];
    if (four.slice(1).some((part) => Number(part) > 255)) return true;
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (!/^[0-9a-f:.]+$/.test(text) || !text.includes(':')) return true;
  // An IPv4 address written inside an IPv6 one is judged as the IPv4 address it is.
  const inner = /:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (inner?.[1] !== undefined) return isPrivateAddress(inner[1]);
  const mapped = /^(?:0{0,4}:){2,5}ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(text);
  if (mapped) {
    const [high, low] = [parseInt(mapped[1] ?? '', 16), parseInt(mapped[2] ?? '', 16)];
    return isPrivateAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  if (/^[0:]+1?$/.test(text)) return true;
  const first = parseInt(text.split(':')[0] || '0', 16);
  // fc00::/7 is private, fe80::/10 joins neighbours, ff00::/8 is for many at once, 64:ff9b:: and 2002:: carry IPv4.
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00 || first === 0x64 || first === 0x2002 || first === 0;
}
