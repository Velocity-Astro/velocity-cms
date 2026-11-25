import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { d1Binding, inWorker } from './d1-binding.js';

afterEach(() => vi.restoreAllMocks());

it('knows it is not in a Worker here', () => {
  expect(inWorker()).toBe(false);
});

it('says what is missing when a D1 database cannot be reached from this computer', async () => {
  // An empty folder stands for a site with no Wrangler config. Wrangler itself may or may not be found from there.
  vi.spyOn(process, 'cwd').mockReturnValue(mkdtempSync(join(tmpdir(), 'cms-no-wrangler-')));
  await expect(d1Binding('DB')).rejects.toThrow(/npm install --save-dev wrangler|no D1 database bound as "DB"/);
});
