import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { AdminFiles } from './admin-files.js';

const directory = mkdtempSync(path.join(tmpdir(), 'cms-admin-files-'));
writeFileSync(path.join(directory, 'index.html'), '<html><head><!--velocity-cms--></head><body></body></html>');
const files = new AdminFiles(directory, { siteName: 'From the code', adminPath: '/admin', apiPath: '/api/cms', authPath: '/api/cms/auth' });
const config = async (response: Response) => {
  const page = await response.text();
  const block = /<script type="application\/json" id="velocity-cms-config">(.*?)<\/script>/s.exec(page)?.[1] ?? '';
  return { page, config: JSON.parse(block) as { siteName: string; adminPath: string } };
};

it('writes the site\'s own name into the editor\'s page until an owner gives another', async () => {
  const request = new Request('https://site.test/admin');
  expect((await config(files.respond(request))).config).toMatchObject({ siteName: 'From the code', adminPath: '/admin' });
  expect((await config(files.respond(request, null))).config.siteName).toBe('From the code');
  expect((await config(files.respond(request, 'Oakhaven Homes'))).config.siteName).toBe('Oakhaven Homes');
});

it('keeps a name from ending the block, starting a script or being read as a pattern', async () => {
  const name = "</script><script>alert(1)</script> $& $' $1";
  const { page, config: read } = await config(files.respond(new Request('https://site.test/admin'), name));
  expect(read.siteName).toBe(name);
  expect(page).not.toContain('<script>alert');
  expect(page.match(/<script/g)).toHaveLength(1);
});
