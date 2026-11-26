// @vitest-environment jsdom
import { richTextHtml, richTextSchema } from '@velocity-astro/cms-core';
import { expect, it } from 'vitest';
import { richTextFromHtml } from './rich-from-html.js';

const back = (html: string) => {
  const text = richTextFromHtml(html);
  return text ? richTextHtml(richTextSchema.parse(text)) : undefined;
};

it('reads back what a page shows of formatted text, unchanged', () => {
  for (const html of [
    '<p>One</p><p>Two <strong>bold</strong> and <em>slanted</em>.</p>',
    '<h2 id="heading">Heading</h2><h3 id="sub">Sub</h3><p>Line<br>next</p>',
    '<ul><li><p>One</p></li><li><p>Two</p><ul><li><p>Inner</p></li></ul></li></ul><ol><li><p>First</p></li></ol>',
    '<blockquote><p>Said <a href="/contact/">here</a> and <a href="https://example.com/a?b=1&amp;c=2" rel="noopener noreferrer">there</a>.</p></blockquote>',
    '<p><em><strong>Both</strong></em></p>',
    '<p>One</p><p></p><p>Three</p>',
  ]) {
    expect(back(html)).toBe(html);
  }
});

it('takes what a browser writes while someone types, and keeps only what the format keeps', () => {
  // A browser writes b and i, a div for a new line, and a break in an empty one.
  expect(back('<p>One <b>bold</b> <i>slanted</i></p><div>Two</div><p><br></p>')).toBe('<p>One <strong>bold</strong> <em>slanted</em></p><p>Two</p>');
  expect(back('Loose <b>words</b><p>Then a line</p>trailing')).toBe('<p>Loose <strong>words</strong></p><p>Then a line</p><p>trailing</p>');
  expect(back('<p><span style="color:red" onclick="x()">Plain</span> <u>words</u><script>alert(1)</script></p>')).toBe('<p>Plain wordsalert(1)</p>');
  expect(back('<h1>Top</h1><h5>Low</h5>')).toBe('<h2 id="top">Top</h2><h3 id="low">Low</h3>');
  expect(back('<ul><li>Bare</li><li></li></ul>')).toBe('<ul><li><p>Bare</p></li><li><p></p></li></ul>');
  expect(back('<p>\n  Spread\n  over lines  </p>')).toBe('<p>Spread over lines</p>');
});

it('drops a link that leads where a site may not, and keeps its words', () => {
  expect(back('<p><a href="javascript:alert(1)">Press</a> <a href="//evil.test">me</a> <a>or</a> <a href=" /fine/ ">this</a></p>')).toBe('<p>Press me or <a href="/fine/">this</a></p>');
});

it('says nothing is there when nothing can be read', () => {
  expect(richTextFromHtml('')).toBeUndefined();
  expect(richTextFromHtml('<p><br></p><div>  </div>')).toBeUndefined();
});
