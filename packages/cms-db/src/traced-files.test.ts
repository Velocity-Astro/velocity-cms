import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeFileTrace } from '@vercel/nft';
import { describe, expect, it } from 'vitest';

/**
 * A host that ships only the files it can see a site needs (Vercel) finds them by reading the
 * code. The migrations are data, found only when the path to them is written the way such a host
 * follows. Without them a deployed site answers 500 at every address: nothing in Node notices.
 */
describe('the files a host traces from the built package', () => {
  it('include the migrations', async () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const { fileList } = await nodeFileTrace([path.join(root, 'dist', 'index.js')], { base: root });
    const traced = [...fileList];
    expect(traced).toContain(path.join('migrations', 'meta', '_journal.json'));
    expect(traced.some((file) => file.startsWith(`migrations${path.sep}`) && file.endsWith('.sql'))).toBe(true);
  });
});
