import { expect, it } from 'vitest';
import { createFieldRegistry } from './fields/index.js';

const fields = createFieldRegistry();
const link = fields.get('link');
const check = (value: unknown, options: object = {}) => link.schema(link.options.parse(options), { fields, mode: 'publish' }).safeParse(value);

it('takes a link to one of the site\'s entries, by what never changes about it', () => {
  expect(check({ kind: 'entry', type: 'pages', entry: 'group-1' }).success).toBe(true);
  expect(check({ kind: 'entry', type: 'pages' }).success).toBe(false);
  expect(check({ kind: 'entry', type: 'pages', entry: 'group-1', href: '/x' }).success).toBe(false);
});

it('keeps to the content types a field names', () => {
  expect(check({ kind: 'entry', type: 'pages', entry: 'g' }, { to: ['pages'] }).success).toBe(true);
  const refused = check({ kind: 'entry', type: 'agents', entry: 'g' }, { to: ['pages'] });
  expect(refused.success).toBe(false);
  expect(refused.error?.issues[0]?.message).toBe('This field cannot link to that kind of entry. Choose another.');
});

it('takes an address on this site, on this page, or a web, mail or phone address', () => {
  for (const href of ['/about', '/about/#team', '#top', 'https://example.com/a?b=c', 'mailto:hello@example.com', 'tel:+15125550100']) {
    expect(check({ kind: 'address', href }).success, href).toBe(true);
  }
});

it('refuses an address that is not a link, and says what one looks like', () => {
  for (const href of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', '//elsewhere.example', 'about', 'data:text/html,x', '/a b', '']) {
    const refused = check({ kind: 'address', href });
    expect(refused.success, href).toBe(false);
    expect(refused.error?.issues[0]?.message).toContain('starts with "/"');
  }
});
