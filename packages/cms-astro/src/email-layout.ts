import type { MailBrand } from '@velocity-astro/cms-auth';

/**
 * The one layout every email of the CMS is drawn in: the site's logo or name above a card, the
 * card with its words, a button and any details, and a foot that says who sent it and why. It
 * is written the way email must be: tables for the layout, every style on its element, nothing
 * a client strips (no script, no web font, no image it cannot load), and a plain-text copy of
 * the same words for clients that show no HTML.
 *
 * Dark mode: clients that follow `prefers-color-scheme` (Apple Mail, Outlook on a Mac and
 * phones, Outlook.com) get the dark colours below; Gmail darkens the light ones itself, which
 * these colours were chosen to survive.
 */

/** Velocity's own orange: a site's emails wear it until its settings name a colour. */
export const VELOCITY_ORANGE = '#F94C10';

/** One answer of a form, or one fact, shown under its label. */
export interface EmailDetail {
  readonly label: string;
  readonly value: string;
}

export interface EmailContent {
  /** The site's name: the header, when there is no logo, and the foot. */
  readonly siteName: string;
  readonly brand?: MailBrand | undefined;
  /** The subject, as the page's title. */
  readonly subject: string;
  /** The line a client shows beside the subject in the inbox. */
  readonly preview: string;
  readonly heading: string;
  /** The words, one paragraph each. */
  readonly paragraphs: readonly string[];
  /** One button, and its address shown in full under it for clients that hide buttons. */
  readonly button?: { readonly label: string; readonly url: string; readonly fallback?: string | undefined } | undefined;
  /** Facts under the words, such as what a visitor sent. */
  readonly details?: readonly EmailDetail[] | undefined;
  /** Small words after the button and details. */
  readonly notes?: readonly string[] | undefined;
  /** Why this address was sent the email, in the foot. */
  readonly reason: string;
}

const escaped = (text: string) => text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
/** Escaped, with the lines a person typed kept as lines. */
const lines = (text: string) => escaped(text).replace(/\r?\n/g, '<br>');

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#rrggbb` from a colour a person set, or `null` when it is not a hex colour. */
export function hexColour(value: string | undefined): string | null {
  if (value === undefined || !HEX.test(value.trim())) return null;
  const hex = value.trim().slice(1);
  const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex;
  return `#${full.toLowerCase()}`;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The colour of words on a button of the brand's colour: white where it reads (as on Velocity's
 * orange), and near black on a light colour such as yellow, where white would vanish.
 */
export function inkOn(hex: string): string {
  return 1.05 / (luminance(hex) + 0.05) >= 3 ? '#ffffff' : '#111111';
}

/** The colours of the light layout. The dark ones are in the style sheet, by class. */
const LIGHT = {
  page: '#f4f4f5',
  card: '#ffffff',
  border: '#e4e4e7',
  text: '#18181b',
  muted: '#52525b',
  faint: '#71717a',
  panel: '#f8f8f9',
} as const;

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const STYLE = `
:root{color-scheme:light dark;supported-color-schemes:light dark}
body{margin:0!important;padding:0!important;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0}
img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}
a{text-decoration:underline}
.vc-logo-dark{display:none;max-height:0;overflow:hidden;mso-hide:all}
@media (max-width:600px){
.vc-shell{padding:24px 12px!important}
.vc-pad{padding:28px 24px!important}
.vc-heading{font-size:22px!important;line-height:30px!important}
}
@media (prefers-color-scheme:dark){
.vc-page{background-color:#0c0c0e!important}
.vc-card{background-color:#18181b!important;border-color:#2e2e33!important}
.vc-text{color:#f4f4f5!important}
.vc-muted{color:#b4b4bb!important}
.vc-faint{color:#8e8e96!important}
.vc-panel{background-color:#222226!important;border-color:#2e2e33!important}
.vc-rule{border-color:#2e2e33!important}
.vc-has-dark .vc-logo-light{display:none!important}
.vc-has-dark .vc-logo-dark{display:block!important;max-height:none!important;overflow:visible!important}
}
[data-ogsc] .vc-text{color:#f4f4f5!important}
[data-ogsc] .vc-muted{color:#b4b4bb!important}
[data-ogsc] .vc-faint{color:#8e8e96!important}
`
  .trim()
  .replace(/\n/g, '');

/** The top of the email: the logo, or the site's initial in its colour beside its name. */
function header(content: EmailContent, colour: string): string {
  const { brand, siteName } = content;
  const home = brand?.url;
  const wrap = (inner: string) => (home === undefined ? inner : `<a href="${escaped(home)}" style="text-decoration:none;color:inherit" target="_blank">${inner}</a>`);
  if (brand?.logo !== undefined) {
    const image = (src: string, className: string) =>
      `<img class="${className}" src="${escaped(src)}" alt="${escaped(siteName)}" height="40" style="display:block;height:40px;width:auto;max-width:240px;border:0;color:${LIGHT.text};font:600 20px/40px ${FONT}">`;
    const dark = brand.logoDark === undefined ? '' : `<div class="vc-logo-dark">${image(brand.logoDark, '')}</div>`;
    return `<div class="${brand.logoDark === undefined ? '' : 'vc-has-dark'}">${wrap(`<div class="vc-logo-light">${image(brand.logo, '')}</div>${dark}`)}</div>`;
  }
  const initial = [...siteName.trim()][0]?.toUpperCase() ?? '';
  const tile = `<td width="36" height="36" align="center" valign="middle" bgcolor="${colour}" style="width:36px;height:36px;border-radius:9px;background-color:${colour};color:${inkOn(colour)};font:700 18px/36px ${FONT};mso-line-height-rule:exactly">${escaped(initial)}</td>`;
  const name = `<td style="padding-left:12px"><span class="vc-text" style="color:${LIGHT.text};font:700 18px/36px ${FONT};mso-line-height-rule:exactly">${escaped(siteName)}</span></td>`;
  return wrap(`<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${tile}${name}</tr></table>`);
}

/** A button that is a button in Outlook too, which ignores padding on a link. */
function button(label: string, url: string, colour: string): string {
  const ink = inkOn(colour);
  const href = escaped(url);
  const text = escaped(label);
  return [
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0"><tr><td>',
    `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:48px;v-text-anchor:middle;width:220px" arcsize="17%" stroke="f" fillcolor="${colour}"><w:anchorlock/><center style="color:${ink};font-family:Arial,sans-serif;font-size:16px;font-weight:bold">${text}</center></v:roundrect><![endif]-->`,
    `<!--[if !mso]><!--><a href="${href}" target="_blank" style="display:inline-block;background-color:${colour};color:${ink};font:600 16px/48px ${FONT};text-decoration:none;padding:0 28px;border-radius:8px;mso-hide:all">${text}</a><!--<![endif]-->`,
    '</td></tr></table>',
  ].join('');
}

/** The facts, each label above its value, in a soft panel. */
function details(rows: readonly EmailDetail[]): string {
  const cells = rows
    .map(
      (row, index) =>
        `<tr><td class="vc-rule" style="padding:${index === 0 ? '0' : '14px'} 0 14px;${index === rows.length - 1 ? '' : `border-bottom:1px solid ${LIGHT.border};`}">` +
        `<div class="vc-faint" style="color:${LIGHT.faint};font:600 12px/18px ${FONT};letter-spacing:.04em;text-transform:uppercase;margin:0 0 4px">${escaped(row.label)}</div>` +
        `<div class="vc-text" style="color:${LIGHT.text};font:400 16px/24px ${FONT};word-break:break-word">${lines(row.value)}</div>` +
        '</td></tr>',
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="vc-panel" style="border-collapse:separate;margin:24px 0 0;background-color:${LIGHT.panel};border:1px solid ${LIGHT.border};border-radius:10px"><tr><td style="padding:18px 20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${cells}</table></td></tr></table>`;
}

/** The email, as HTML and as plain text with the same words. */
export function renderEmail(content: EmailContent): { html: string; text: string } {
  const colour = hexColour(content.brand?.color) ?? VELOCITY_ORANGE;
  const paragraph = (words: string) => `<p class="vc-muted" style="margin:0 0 16px;color:${LIGHT.muted};font:400 16px/26px ${FONT}">${lines(words)}</p>`;
  const small = (words: string) => `<p class="vc-faint" style="margin:16px 0 0;color:${LIGHT.faint};font:400 13px/20px ${FONT};word-break:break-word">${lines(words)}</p>`;
  const host = content.brand?.url === undefined ? null : new URL(content.brand.url).host;

  const body = [
    `<h1 class="vc-text vc-heading" style="margin:0 0 16px;color:${LIGHT.text};font:700 24px/32px ${FONT};letter-spacing:-.01em">${escaped(content.heading)}</h1>`,
    ...content.paragraphs.map(paragraph),
    content.button === undefined ? '' : button(content.button.label, content.button.url, colour),
    content.button?.fallback === undefined
      ? ''
      : `<p class="vc-faint" style="margin:24px 0 0;color:${LIGHT.faint};font:400 13px/20px ${FONT};word-break:break-all">${escaped(content.button.fallback)}<br><a href="${escaped(content.button.url)}" target="_blank" class="vc-faint" style="color:${LIGHT.faint};text-decoration:underline">${escaped(content.button.url)}</a></p>`,
    content.details === undefined || content.details.length === 0 ? '' : details(content.details),
    ...(content.notes ?? []).map(small),
  ].join('');

  const foot = [
    `<p class="vc-faint" style="margin:0 0 6px;color:${LIGHT.faint};font:600 13px/20px ${FONT}">${escaped(content.siteName)}${
      host === null ? '' : ` &middot; <a href="${escaped(content.brand?.url ?? '')}" target="_blank" class="vc-faint" style="color:${LIGHT.faint};text-decoration:underline">${escaped(host)}</a>`
    }</p>`,
    `<p class="vc-faint" style="margin:0;color:${LIGHT.faint};font:400 12px/18px ${FONT}">${escaped(content.reason)}</p>`,
  ].join('');

  // Spaces that are not there after the preview, so a client does not fill the line with the body.
  const filler = '&#847;&zwnj;&nbsp;'.repeat(40);
  const html = [
    '<!doctype html>',
    '<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">',
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge">',
    '<meta name="x-apple-disable-message-reformatting"><meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">',
    '<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">',
    `<title>${escaped(content.subject)}</title>`,
    '<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->',
    `<style>${STYLE}</style></head>`,
    `<body class="vc-page" style="margin:0;padding:0;background-color:${LIGHT.page};word-spacing:normal">`,
    `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escaped(content.preview)}${filler}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="vc-page" bgcolor="${LIGHT.page}" style="background-color:${LIGHT.page}"><tr><td align="center" class="vc-shell" style="padding:40px 16px">`,
    '<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto;border-collapse:separate">',
    `<tr><td style="padding:0 4px 24px">${header(content, colour)}</td></tr>`,
    `<tr><td class="vc-card" bgcolor="${LIGHT.card}" style="background-color:${LIGHT.card};border:1px solid ${LIGHT.border};border-radius:14px;overflow:hidden">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate"><tr><td height="4" bgcolor="${colour}" style="height:4px;line-height:4px;font-size:4px;background-color:${colour};border-radius:13px 13px 0 0">&nbsp;</td></tr>`,
    `<tr><td class="vc-pad" style="padding:36px 40px 40px">${body}</td></tr></table>`,
    '</td></tr>',
    `<tr><td style="padding:24px 4px 0">${foot}</td></tr>`,
    '</table>',
    '<!--[if mso]></td></tr></table><![endif]-->',
    '</td></tr></table></body></html>',
  ].join('');

  const text = [
    content.heading,
    ...content.paragraphs,
    ...(content.button === undefined ? [] : [`${content.button.label}: ${content.button.url}`]),
    ...(content.details ?? []).map((row) => `${row.label}:\n${row.value}`),
    ...(content.notes ?? []),
    `--\n${content.siteName}${content.brand?.url === undefined ? '' : ` · ${content.brand.url}`}\n${content.reason}`,
  ].join('\n\n');

  return { html, text };
}
