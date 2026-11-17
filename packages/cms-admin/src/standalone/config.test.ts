import { expect, it } from 'vitest';
import { parseEditorConfig } from './config.js';

const config = { siteName: 'Lakeshore Realty', adminPath: '/admin', apiPath: '/api/cms', authPath: '/api/cms/auth' };

it('reads what the server wrote into the page, and nothing else', () => {
  expect(parseEditorConfig(JSON.stringify({ ...config, secret: 'never' }))).toEqual(config);
});

it('says what is missing when the page was not served by the CMS', () => {
  expect(() => parseEditorConfig(null)).toThrow('siteName, adminPath, apiPath, authPath');
  expect(() => parseEditorConfig('{oops')).toThrow('must be served by the Velocity CMS integration');
  expect(() => parseEditorConfig(JSON.stringify({ ...config, apiPath: 5 }))).toThrow('(apiPath)');
});
