import { describe, expect, it } from 'vitest';
import { createFieldRegistry } from './fields/index.js';
import {
  embedFromUrl,
  isPlainRichText,
  limitRichText,
  publicRichText,
  richTextFromMarkdown,
  richTextHtml,
  richTextNeeds,
  richTextParagraphs,
  richTextSchema,
  richTextToMarkdown,
  type RichText,
} from './rich-text.js';

const text = (words: string, ...marks: object[]) => ({ type: 'text', text: words, ...(marks.length > 0 && { marks }) });
const para = (...content: object[]) => ({ type: 'paragraph', content });

/** One of every kind of block and mark, as the editor sends them. */
const long = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 4, align: 'center' }, content: [text('Small print')] },
    { type: 'paragraph', attrs: { align: 'right' }, content: [text('H'), text('2', { type: 'subscript' }), text('O and x'), text('2', { type: 'superscript' }), text(' '), text('gone', { type: 'strike' }), text(' '), text('under', { type: 'underline' })] },
    para(text('Our brand', { type: 'colour', attrs: { name: 'brand' } }), text(' and '), text('this', { type: 'highlight', attrs: { name: 'sun' } })),
    para(text('Read the post', { type: 'link', attrs: { entryType: 'posts', entry: 'g-1', target: '_blank' } }), text(' or '), text('a shop', { type: 'link', attrs: { href: 'https://shop.example', rel: 'sponsored' } })),
    { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [para(text('Third'))] }] },
    { type: 'codeBlock', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'const a = 1 < 2;\nconsole.log(a);' }] },
    { type: 'horizontalRule' },
    { type: 'image', attrs: { image: 'kitchen.webp', alt: 'The kitchen', caption: 'After the work', href: '/listings/', size: 'wide' } },
    {
      type: 'table',
      attrs: { style: 'striped' },
      content: [
        { type: 'tableRow', content: [{ type: 'tableHeader', content: [para(text('Plan'))] }, { type: 'tableHeader', content: [para(text('Price'))] }] },
        { type: 'tableRow', content: [{ type: 'tableCell', content: [para(text('Pro', { type: 'bold' }))] }, { type: 'tableCell', content: [para(text('$9 | month'))] }] },
      ],
    },
    { type: 'callout', attrs: { tone: 'tip' }, content: [para(text('Save first.'))] },
    { type: 'details', content: [{ type: 'detailsSummary', content: [text('Why?')] }, { type: 'detailsContent', content: [para(text('Because.'))] }] },
    { type: 'embed', attrs: { provider: 'youtube', id: 'dQw4w9WgXcQ', title: 'Our tour' } },
    { type: 'button', attrs: { label: 'Book a visit', href: '/contact/', style: 'primary' } },
  ],
};

const looks = {
  colours: { choices: ['brand'] },
  highlights: { choices: ['sun'] },
  tables: { choices: ['striped'] },
  buttons: { choices: ['primary'] },
};

describe('long-form text', () => {
  it('takes every new kind of block and mark, and gives it back unchanged', () => {
    expect(richTextSchema.parse(long)).toEqual(long);
  });

  it('drops what means nothing, as the editor sends it, so both sides write the same text', () => {
    const fromEditor = {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { align: null }, content: [text('a')] },
        { type: 'orderedList', attrs: { start: 1 }, content: [{ type: 'listItem', content: [para(text('b'))] }] },
        { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [para(text('c'))] }] }] },
        { type: 'codeBlock', attrs: { language: null }, content: [{ type: 'text', text: 'd' }] },
      ],
    };
    expect(richTextSchema.parse(fromEditor)).toEqual({
      type: 'doc',
      content: [
        para(text('a')),
        { type: 'orderedList', content: [{ type: 'listItem', content: [para(text('b'))] }] },
        { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [para(text('c'))] }] }] },
        { type: 'codeBlock', content: [{ type: 'text', text: 'd' }] },
      ],
    });
  });

  it('refuses a link that leads nowhere or two ways, a picture link to a script, and a video the service could not have given', () => {
    const doc = (block: object) => ({ type: 'doc', content: [block] });
    expect(richTextSchema.safeParse(doc(para(text('x', { type: 'link', attrs: {} })))).success).toBe(false);
    expect(richTextSchema.safeParse(doc(para(text('x', { type: 'link', attrs: { href: '/a', entryType: 'posts', entry: 'g' } })))).success).toBe(false);
    expect(richTextSchema.safeParse(doc({ type: 'image', attrs: { image: 'a.webp', alt: '', href: 'javascript:alert(1)' } })).success).toBe(false);
    expect(richTextSchema.safeParse(doc({ type: 'embed', attrs: { provider: 'youtube', id: '"><script>', title: 'x' } })).success).toBe(false);
    expect(richTextSchema.safeParse(doc({ type: 'table', attrs: { style: 'Striped Red' }, content: [] })).success).toBe(false);
  });

  it('is HTML a template styles by name, with every word and address escaped', () => {
    const parsed = richTextSchema.parse(long);
    const html = richTextHtml(parsed, {
      entryHref: (type, entry) => (type === 'posts' && entry === 'g-1' ? '/blog/hello/' : undefined),
      image: (name) => (name === 'kitchen.webp' ? { src: '/media/kitchen.webp', width: 1600, height: 900, srcset: '/media/kitchen.webp?w=640 640w' } : undefined),
    });
    expect(html).toContain('<h4 id="small-print" class="cms-align-center">Small print</h4>');
    expect(html).toContain('<p class="cms-align-right">H<sub>2</sub>O and x<sup>2</sup> <s>gone</s> <u>under</u></p>');
    expect(html).toContain('<span class="cms-colour-brand">Our brand</span> and <mark class="cms-highlight-sun">this</mark>');
    expect(html).toContain('<a href="/blog/hello/" target="_blank" rel="noopener noreferrer">Read the post</a>');
    expect(html).toContain('<a href="https://shop.example" rel="noopener noreferrer sponsored">a shop</a>');
    expect(html).toContain('<ol start="3">');
    expect(html).toContain('<pre class="cms-code" data-language="ts"><code class="language-ts">const a = 1 &lt; 2;\nconsole.log(a);</code></pre><hr>');
    expect(html).toContain(
      '<figure class="cms-image cms-image-wide"><a href="/listings/"><img src="/media/kitchen.webp" alt="The kitchen" width="1600" height="900" srcset="/media/kitchen.webp?w=640 640w" sizes="(min-width: 72rem) 72rem, 100vw" loading="lazy" decoding="async"></a><figcaption>After the work</figcaption></figure>',
    );
    expect(html).toContain('<div class="cms-table cms-table-striped" tabindex="0"><table><thead><tr><th scope="col">Plan</th><th scope="col">Price</th></tr></thead><tbody><tr><td><strong>Pro</strong></td><td>$9 | month</td></tr></tbody></table></div>');
    expect(html).toContain('<div class="cms-callout cms-callout-tip" role="note"><p>Save first.</p></div>');
    expect(html).toContain('<details class="cms-details"><summary>Why?</summary><div class="cms-details-content"><p>Because.</p></div></details>');
    expect(html).toContain('<iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" title="Our tour" loading="lazy"');
    expect(html).toContain('<p class="cms-button-row"><a class="cms-button cms-button-primary" href="/contact/">Book a visit</a></p>');
  });

  it('leaves out a link to an entry, and a picture, the site cannot find, and keeps the words', () => {
    const html = richTextHtml(richTextSchema.parse(long));
    expect(html).toContain('<p>Read the post or ');
    expect(html).not.toContain('<figure class="cms-image');
    expect(richTextNeeds(richTextSchema.parse(long))).toEqual({ entries: [{ type: 'posts', entry: 'g-1' }], images: ['kitchen.webp'] });
  });

  it('hands the text a piece at a time, with each heading and where its videos come from', () => {
    const shown = publicRichText(richTextSchema.parse(long));
    expect(shown.parts.map((part) => part.kind)).toEqual(['prose', 'code', 'prose', 'image', 'table', 'callout', 'details', 'embed', 'button']);
    expect(shown.parts.map((part) => part.html).join('')).toBe(shown.html);
    expect(shown.parts[1]).toMatchObject({ kind: 'code', code: 'const a = 1 < 2;\nconsole.log(a);', language: 'ts' });
    expect(shown.parts[3]).toMatchObject({ kind: 'image', image: 'kitchen.webp', alt: 'The kitchen', size: 'wide', href: '/listings/' });
    expect(shown.headings).toEqual([{ level: 4, text: 'Small print', id: 'small-print' }]);
    expect(shown.frames).toEqual(['https://www.youtube-nocookie.com']);
    expect(richTextParagraphs(shown.doc)).toContain('$9 | month');
  });

  it('makes heading ids as GitHub does, once each', () => {
    const doc = richTextFromMarkdown('## Hello, World!\n\n## Hello, World!\n\n## ¿Qué tal?');
    expect(publicRichText(doc).headings.map((heading) => heading.id)).toEqual(['hello-world', 'hello-world-1', 'qué-tal']);
  });
});

describe('a field with formats and looks', () => {
  const parsed = richTextSchema.parse(long) as RichText;

  it('keeps everything, with the looks the template has', () => {
    expect(limitRichText(parsed, undefined, looks)).toEqual(parsed);
  });

  it('takes off a look the template does not have, and gives a callout its first tone', () => {
    const limited = limitRichText(parsed, undefined, { callouts: { choices: ['note'] } });
    const html = richTextHtml(limited);
    expect(html).not.toContain('cms-colour-');
    expect(html).not.toContain('cms-highlight-');
    expect(html).toContain('<div class="cms-table" tabindex="0">');
    expect(html).toContain('cms-callout-note');
    expect(html).toContain('class="cms-button" href="/contact/"');
  });

  it('turns every long-form kind into paragraphs and links, and loses no word', () => {
    const plain = limitRichText(parsed, ['link'], looks);
    expect(plain.content.every((block) => block.type === 'paragraph')).toBe(true);
    const html = richTextHtml(plain);
    expect(html).toContain('<p>Small print</p>');
    expect(html).toContain('<p>const a = 1 &lt; 2;<br>console.log(a);</p>');
    expect(html).toContain('<p>After the work</p>');
    expect(html).toContain('<p><a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ" rel="noopener noreferrer">Our tour</a></p>');
    expect(html).toContain('<p><a href="/contact/">Book a visit</a></p>');
    for (const words of ['Plan', 'Price', 'Pro', 'Save first.', 'Why?', 'Because.']) expect(richTextParagraphs(plain)).toContain(words);
  });

  it('is what the field saves and hands to the site', () => {
    const field = createFieldRegistry().get('richtext');
    const context = { fields: createFieldRegistry(), mode: 'draft' as const };
    const options = field.options.parse({ formats: ['bold', 'colour'], colours: { choices: ['brand'], swatches: { brand: '#ea580c' } } });
    const saved = field.schema(options, context).parse(long) as RichText;
    expect(JSON.stringify(saved)).toContain('"colour"');
    expect(JSON.stringify(saved)).not.toContain('"highlight"');
    expect(field.options.safeParse({ colours: { choices: ['Brand Red'] } }).success).toBe(false);
    expect(field.options.safeParse({ colours: { choices: ['brand'], swatches: { brand: 'url(x)' } } }).success).toBe(false);
  });
});

describe('long-form Markdown', () => {
  it('writes every kind as an agent reads it, and reads it back as the same text', () => {
    const parsed = richTextSchema.parse(long) as RichText;
    const markdown = richTextToMarkdown(parsed);
    expect(markdown).toContain('#### Small print {align=center}');
    expect(markdown).toContain('H<sub>2</sub>O and x<sup>2</sup> ~~gone~~ <u>under</u> {align=right}');
    expect(markdown).toContain('[Our brand]{colour=brand} and [this]{highlight=sun}');
    expect(markdown).toContain('[Read the post](entry:posts/g-1){target=_blank}');
    expect(markdown).toContain('```ts\nconst a = 1 < 2;\nconsole.log(a);\n```');
    expect(markdown).toContain('[![The kitchen](kitchen.webp "After the work")](/listings/){size=wide}');
    expect(markdown).toContain('| Plan | Price |\n| --- | --- |\n| **Pro** | $9 \\| month |\n{style=striped}');
    expect(markdown).toContain('> [!TIP]\n> Save first.');
    expect(markdown).toContain('<details>\n<summary>Why?</summary>\n\nBecause.\n\n</details>');
    expect(markdown).toContain('[Our tour](https://www.youtube.com/watch?v=dQw4w9WgXcQ){embed}');
    expect(markdown).toContain('[Book a visit](/contact/){button=primary}');
    expect(richTextSchema.parse(richTextFromMarkdown(markdown))).toEqual(parsed);
  });

  it('reads what people paste: a bare video address, a table with no header, a fence in a list', () => {
    const doc = richTextFromMarkdown('https://youtu.be/dQw4w9WgXcQ\n\n| a | b |\n| --- | --- |\n| c | d |\n{header=none}\n\n- item\n\n  ```\n  code\n  ```');
    expect(doc.content[0]).toEqual({ type: 'embed', attrs: { provider: 'youtube', id: 'dQw4w9WgXcQ', title: 'YouTube' } });
    expect(doc.content[1]).toMatchObject({ type: 'table', content: [{ content: [{ type: 'tableCell' }, { type: 'tableCell' }] }, { content: [{ type: 'tableCell' }, { type: 'tableCell' }] }] });
    expect(JSON.stringify(doc.content[2])).toContain('"codeBlock"');
  });

  it('keeps words that only look like the new marks as words', () => {
    const words = ['a ~ tilde and {braces} and <tag>', 'https://youtu.be/dQw4w9WgXcQ', '| not a table |', '[x]{colour=brand} typed'];
    const doc = { type: 'doc' as const, content: words.map((line) => ({ type: 'paragraph' as const, content: [{ type: 'text' as const, text: line }] })) };
    expect(richTextFromMarkdown(richTextToMarkdown(doc))).toEqual(doc);
  });

  it('leaves out a picture from elsewhere, and a link no site may hold', () => {
    const doc = richTextFromMarkdown('![x](https://example.com/a.png)\n\n[go](javascript:alert(1)){button}');
    expect(JSON.stringify(doc)).not.toContain('image');
    expect(JSON.stringify(doc)).not.toContain('javascript');
  });
});

describe('embedFromUrl', () => {
  it('knows the addresses each service shares, and nothing else', () => {
    expect(embedFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')).toMatchObject({ provider: 'youtube', id: 'dQw4w9WgXcQ' });
    expect(embedFromUrl('https://youtube.com/shorts/dQw4w9WgXcQ')).toMatchObject({ provider: 'youtube', id: 'dQw4w9WgXcQ' });
    expect(embedFromUrl('https://vimeo.com/76979871')).toMatchObject({ provider: 'vimeo', id: '76979871' });
    expect(embedFromUrl('https://www.loom.com/share/0123456789abcdef0123456789abcdef')).toMatchObject({ provider: 'loom' });
    expect(embedFromUrl('https://open.spotify.com/intl-de/track/4cOdK2wGLETKBW3PvgPWqT?si=x')).toMatchObject({ provider: 'spotify', id: 'track/4cOdK2wGLETKBW3PvgPWqT' });
    expect(embedFromUrl('https://www.google.com/maps/place/Eiffel+Tower/@48.8,2.29,17z')).toMatchObject({ provider: 'maps', id: 'Eiffel Tower' });
    expect(embedFromUrl('https://evil.example/watch?v=dQw4w9WgXcQ')).toBeUndefined();
    expect(embedFromUrl('javascript:alert(1)')).toBeUndefined();
    expect(embedFromUrl('https://www.youtube.com/watch?v=short')).toBeUndefined();
  });
});

it('says which text typing on a page can give back whole', () => {
  const words = (text: string, ...marks: object[]) => ({ type: 'text', text, ...(marks.length > 0 && { marks }) });
  const plain = richTextSchema.parse({ type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [words('Rooms')] }, { type: 'paragraph', content: [words('See ', { type: 'bold' }), words('the tour', { type: 'link', attrs: { href: '/tour/' } })] }] });
  expect(isPlainRichText(plain)).toBe(true);
  for (const block of [
    { type: 'horizontalRule' },
    { type: 'paragraph', attrs: { align: 'center' }, content: [words('Rooms')] },
    { type: 'paragraph', content: [words('Rooms', { type: 'underline' })] },
    { type: 'paragraph', content: [words('Rooms', { type: 'link', attrs: { href: '/tour/', target: '_blank' } })] },
    { type: 'paragraph', content: [words('Rooms', { type: 'link', attrs: { entryType: 'pages', entry: 'g1' } })] },
    { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [words('Rooms')] }] }] },
  ]) {
    expect(isPlainRichText(richTextSchema.parse({ type: 'doc', content: [block] }))).toBe(false);
  }
});

it('reads details whose summary is on the same line as it opens', () => {
  const text = richTextFromMarkdown('<details><summary>Question</summary>\n\nAnswer\n\n</details>');
  expect(text.content[0]).toEqual({ type: 'details', content: [{ type: 'detailsSummary', content: [{ type: 'text', text: 'Question' }] }, { type: 'detailsContent', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Answer' }] }] }] });
  expect(richTextFromMarkdown('```html\n<details><summary>Q</summary>\n```').content[0]).toMatchObject({ type: 'codeBlock' });
});
