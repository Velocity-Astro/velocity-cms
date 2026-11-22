import { expect, it } from 'vitest';
import { hexColour, inkOn, renderEmail, VELOCITY_ORANGE } from './email-layout.js';

const base = { siteName: 'Lakeshore', subject: 'Sign in', preview: 'Your link', heading: 'Sign in to Lakeshore', paragraphs: ['Hi Dana,'], reason: 'Because you asked.' };

it('draws a whole email, light and dark, wearing Velocity\'s orange until the site names a colour', () => {
  const { html, text } = renderEmail({ ...base, button: { label: 'Sign in', url: 'https://site.test/in?a=1&b=2', fallback: 'Or copy this:' } });
  expect(html.startsWith('<!doctype html>')).toBe(true);
  expect(html).toContain('<meta name="color-scheme" content="light dark">');
  expect(html).toContain('@media (prefers-color-scheme:dark)');
  expect(html).toContain(`background-color:${VELOCITY_ORANGE}`);
  // A button Outlook draws too, and the address in full for a client that hides it.
  expect(html).toContain('<v:roundrect');
  expect(html).toContain('href="https://site.test/in?a=1&#38;b=2"');
  expect(text).toBe('Sign in to Lakeshore\n\nHi Dana,\n\nSign in: https://site.test/in?a=1&b=2\n\n--\nLakeshore\nBecause you asked.');
});

it('shows the logo and its dark version when the site has them, and the site\'s initial in its colour when it has none', () => {
  const branded = renderEmail({ ...base, brand: { logo: 'https://site.test/cms-mail/logo.png', logoDark: 'https://site.test/cms-mail/logo-dark.png', color: '#fde047', url: 'https://site.test' } });
  expect(branded.html).toContain('src="https://site.test/cms-mail/logo.png"');
  expect(branded.html).toContain('class="vc-logo-dark"');
  expect(branded.html).toContain('alt="Lakeshore"');
  expect(branded.html).toContain('site.test</a>');
  expect(branded.text).toContain('Lakeshore · https://site.test');

  const initial = renderEmail({ ...base, brand: { color: '#0a7cff' } });
  expect(initial.html).not.toContain('<img');
  expect(initial.html).toMatch(/background-color:#0a7cff;color:#ffffff[^>]*>L</);
});

it('shows every word it is given as text, never as markup', () => {
  const { html } = renderEmail({ ...base, heading: '<script>x</script>', details: [{ label: 'Message', value: 'one\n<a href="https://spam.example">two</a>' }] });
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<a href="https://spam.example"');
  expect(html).toContain('one<br>&#60;a href=');
});

it('reads only a hex colour, and writes on it in whichever of white or black can be read', () => {
  expect(hexColour('#ABC')).toBe('#aabbcc');
  expect(hexColour('red')).toBeNull();
  expect(hexColour('#12345')).toBeNull();
  expect(inkOn('#f94c10')).toBe('#ffffff');
  expect(inkOn('#fde047')).toBe('#111111');
});
