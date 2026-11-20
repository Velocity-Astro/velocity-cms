// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { PREVIEW_BRIDGE_SCRIPT, previewBridge } from './preview-bridge.js';

const PAGE = `
  <main>
    <div data-cms-section="s1"><section><h1 data-cms-field="title">Welcome</h1><p>Plain words</p></section></div>
    <div data-cms-section="s2"><ul><li data-cms-field="items.0.text">First</li></ul></div>
    <footer><a href="/elsewhere/">Elsewhere</a></footer>
  </main>`;

type Page = Window & typeof globalThis;
let page: Page;
let origin: string;
let said: unknown[];
const rect = (top: number): DOMRect => ({ top, left: 20, width: 100, height: 40, bottom: top + 40, right: 120, x: 20, y: top, toJSON: () => ({}) });

/** A page of the site in a frame of the editor: its parent is another window. */
function open(html = PAGE): void {
  document.body.replaceChildren();
  const frame = document.body.appendChild(document.createElement('iframe'));
  page = frame.contentWindow as Page;
  page.document.body.innerHTML = html;
  origin = page.location.origin;
  said = [];
  vi.spyOn(page.parent, 'postMessage').mockImplementation((message: unknown, to?: unknown) => void said.push([message, to]));
  // Everything is 100 wide and 40 tall, 300 down the page: nothing is laid out here.
  page.Element.prototype.getBoundingClientRect = () => rect(300);
  page.Element.prototype.scrollIntoView = vi.fn();
  page.requestAnimationFrame = (run) => (run(0), 0);
  previewBridge(page);
}

const $ = (selector: string) => page.document.querySelector<HTMLElement>(selector) as HTMLElement;
const box = (name: string) => $(`[data-cms-outline="${name}"]`);
const click = (selector: string) => {
  const event = new page.MouseEvent('click', { bubbles: true, cancelable: true });
  $(selector).dispatchEvent(event);
  return event;
};
/** What the editor says to the page. */
const hear = (data: unknown, from: { origin?: string; source?: unknown } = {}) => {
  const event = new page.MessageEvent('message', { data, origin: from.origin ?? origin });
  Object.defineProperty(event, 'source', { value: 'source' in from ? from.source : page.parent });
  page.dispatchEvent(event);
};

beforeEach(() => {
  vi.restoreAllMocks();
  open();
});

it('does nothing on a page that is not in a frame', () => {
  document.body.innerHTML = '<div data-cms-section="s1">One</div>';
  previewBridge(window);
  expect(document.querySelector('[data-cms-layer]')).toBeNull();
});

it('tells the editor it is ready, and nobody but this site', () => {
  expect(said).toEqual([[{ source: 'velocity-cms', type: 'ready' }, origin]]);
});

it('says which field of which section was clicked', () => {
  const event = click('h1');
  expect(event.defaultPrevented).toBe(true);
  expect(said.at(-1)).toEqual([{ source: 'velocity-cms', type: 'section', id: 's1', field: 'title' }, origin]);
  click('li');
  expect(said.at(-1)).toEqual([{ source: 'velocity-cms', type: 'section', id: 's2', field: 'items.0.text' }, origin]);
});

it('says only the section where what was clicked has no field mark', () => {
  click('p');
  expect(said.at(-1)).toEqual([{ source: 'velocity-cms', type: 'section', id: 's1' }, origin]);
});

it('lets a click outside every section go nowhere and say nothing', () => {
  const event = click('a');
  expect(event.defaultPrevented).toBe(true);
  expect(said).toHaveLength(1);
});

it('outlines what the pointer is over in a layer above the page, and changes nothing of the page\'s own look', () => {
  $('h1').dispatchEvent(new page.MouseEvent('mouseover', { bubbles: true }));
  expect(box('over').style.display).toBe('block');
  expect(box('over').style.top).toBe('300px');
  expect(box('over').style.width).toBe('100px');
  expect($('h1').style.outline).toBe('');
  expect($('[data-cms-layer]').style.pointerEvents).toBe('none');
  $('a').dispatchEvent(new page.MouseEvent('mouseover', { bubbles: true }));
  expect(box('over').style.display).toBe('none');
});

it('keeps what was clicked outlined, with one outline while the pointer is still on it', () => {
  $('h1').dispatchEvent(new page.MouseEvent('mouseover', { bubbles: true }));
  click('h1');
  expect(box('chosen').style.display).toBe('block');
  expect(box('over').style.display).toBe('none');
  $('li').dispatchEvent(new page.MouseEvent('mouseover', { bubbles: true }));
  expect(box('chosen').style.display).toBe('block');
  expect(box('over').style.display).toBe('block');
});

it('shows the section, or the field, the editor asks for, and brings it into view only when it is out of view', () => {
  hear({ source: 'velocity-cms', type: 'show', id: 's2' });
  expect(box('chosen').style.display).toBe('block');
  expect($('[data-cms-section="s2"]').scrollIntoView).not.toHaveBeenCalled();

  page.Element.prototype.getBoundingClientRect = () => rect(4000);
  hear({ source: 'velocity-cms', type: 'show', id: 's1', field: 'title' });
  expect($('h1').scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
  expect(box('chosen').style.top).toBe('4000px');
});

it('shows the section when the field asked for has no mark on the page', () => {
  hear({ source: 'velocity-cms', type: 'show', id: 's1', field: 'lead' });
  expect(box('chosen').style.display).toBe('block');
});

/** A section as a template draws it with `sectionMark(id, data)`: it says what it holds, and its elements carry no mark. */
const held = (id: string, values: unknown, inner: string) => {
  const holder = document.createElement('div');
  holder.dataset['cmsSection'] = id;
  holder.dataset['cmsValues'] = JSON.stringify(values);
  holder.innerHTML = inner;
  return holder.outerHTML;
};
const saidLast = () => (said.at(-1) as [{ field?: string }, string])[0].field;

it('finds a field by the words it shows where the section says what it holds', () => {
  open(
    held(
      's1',
      [['title', 'Find your  place'], ['titleAccent', 'in Austin'], ['lead', 'Homes for sale'], ['body', '<p>One <strong>bold</strong> thing.</p><p>Two.</p>', 'html'], ['tone', 'dark']],
      '<h1 id="h">Find your place <em>in Austin</em></h1><p id="lead"><span>Homes for sale</span></p><div id="body"><p>One <strong>bold</strong> thing.</p>\n<p>Two.</p></div><p id="other">Our own words</p>',
    ),
  );
  click('#h');
  expect(saidLast()).toBe('title');
  click('em');
  expect(saidLast()).toBe('titleAccent');
  click('#lead span');
  expect(saidLast()).toBe('lead');
  click('strong');
  expect(saidLast()).toBe('body');
  click('#other');
  expect(saidLast()).toBeUndefined();
  // Nothing was written on the page to do it.
  expect(page.document.querySelector('[data-cms-field]')).toBeNull();
  hear({ source: 'velocity-cms', type: 'show', id: 's1', field: 'lead' });
  page.Element.prototype.getBoundingClientRect = function (this: Element) {
    return rect(this.tagName === 'SPAN' ? 700 : 300);
  };
  page.dispatchEvent(new page.Event('resize'));
  expect(box('chosen').style.top).toBe('700px');
});

it('gives fields that say the same words the elements that show them in order, and a field shown twice both', () => {
  open(
    held(
      's1',
      [['items.0.title', 'Buy'], ['items.0.link', 'More'], ['items.1.title', 'Sell'], ['items.1.link', 'More']],
      '<ul><li><b id="a">Buy</b><i id="a2">Buy</i><a id="m1">More</a></li><li><b id="b">Sell</b><a id="m2">More</a></li></ul>',
    ),
  );
  click('#a');
  expect(saidLast()).toBe('items.0.title');
  click('#a2');
  expect(saidLast()).toBe('items.0.title');
  click('#m1');
  expect(saidLast()).toBe('items.0.link');
  click('#m2');
  expect(saidLast()).toBe('items.1.link');
});

it('finds a picture by its name, and puts a mark the template wrote before what it finds', () => {
  open(
    held(
      's1',
      [['photo', 'wine'], ['icon', 'home'], ['title', 'Welcome']],
      '<img id="i" src="/_image?href=%2F_astro%2Fwine.abc.jpg&amp;w=800" alt=""><img id="o" src="/_astro/homestead.abc.jpg" alt=""><h2 data-cms-field="heading" id="t">Welcome</h2>',
    ),
  );
  click('#i');
  expect(saidLast()).toBe('photo');
  click('#o');
  expect(saidLast()).toBeUndefined();
  click('#t');
  expect(saidLast()).toBe('heading');
});

it('takes a section that says nonsense about what it holds as one that says nothing', () => {
  open('<div data-cms-section="s1" data-cms-values="{oops"><h1>Welcome</h1></div>');
  click('h1');
  expect(said.at(-1)).toEqual([{ source: 'velocity-cms', type: 'section', id: 's1' }, origin]);
});

/** A page whose first section shows a heading with an accent, a button with an icon, and its title twice. */
const typingPage = () => {
  open(
    held(
      's1',
      [['title', 'Find your place'], ['accent', 'in Austin'], ['label', 'See homes'], ['again', 'Twice'], ['body', '<p>Shaped</p>', 'html'], ['kept', 'Kept']],
      '<h1 id="h">Find your place <em>in Austin</em></h1><a id="a" href="/x/">See homes<svg></svg></a><b id="t1">Twice</b><i id="t2">Twice</i><div id="body"><p>Shaped</p></div><button><span id="inb">Kept</span></button>',
    ),
  );
  hear({ source: 'velocity-cms', type: 'typable', places: { s1: ['title', 'accent', 'label', 'again', 'body', 'kept'] } });
};
const down = (selector: string) => $(selector).dispatchEvent(new page.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
const run = (selector: string) => [...$(selector).childNodes].find((node) => node.nodeType === 3) as Text;
/** What the browser asks before it changes what is typed: the kind of change and what it would touch. */
const before = (selector: string, inputType: string, range: [Node, number, Node, number] | null, data?: string) => {
  const event = new page.InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType, ...(data !== undefined && { data }) });
  const ranges = range ? [new page.StaticRange({ startContainer: range[0], startOffset: range[1], endContainer: range[2], endOffset: range[3] })] : [];
  Object.defineProperty(event, 'getTargetRanges', { value: () => ranges });
  $(selector).dispatchEvent(event);
  return event;
};
const typed = (selector: string) => $(selector).dispatchEvent(new page.InputEvent('input', { bubbles: true }));
const words = () => (said as [{ type: string; field: string; words: string }, string][]).map(([message]) => message).filter((message) => message.type === 'words');

it('lets words be typed into a field the editor says holds plain words, and says them as they are typed', () => {
  typingPage();
  down('#h');
  // Plain text only where the browser knows that kind, as a real one does.
  expect($('#h').hasAttribute('contenteditable')).toBe(true);
  run('#h').nodeValue = 'Find your home ';
  typed('#h');
  expect(words().at(-1)).toEqual({ source: 'velocity-cms', type: 'words', id: 's1', field: 'title', words: 'Find your home' });
  // The words beside it are another field's, and are that field's still.
  expect($('em').textContent).toBe('in Austin');
  // Pressing elsewhere ends it, and the element is as the template made it.
  down('#body');
  expect($('#h').hasAttribute('contenteditable')).toBe(false);
});

it('shows what is typed everywhere the section shows that field', () => {
  typingPage();
  down('#t1');
  run('#t1').nodeValue = 'Thrice';
  typed('#t1');
  expect($('#t2').textContent).toBe('Thrice');
});

it('keeps every change inside the run of text that shows the field', () => {
  typingPage();
  down('#a');
  const label = run('#a');
  // The change is made by the bridge itself, so the browser tidies nothing around the words.
  expect(before('#a', 'insertText', [label, 3, label, 3], 'x').defaultPrevented).toBe(true);
  expect(label.nodeValue).toBe('Seex homes');
  expect(words().at(-1)?.words).toBe('Seex homes');
  // Reaching past the run (the icon after it), the change is kept to the run.
  before('#a', 'deleteContentBackward', [label, 4, $('#a'), 2]);
  expect($('#a').querySelector('svg')).not.toBeNull();
  expect(label.nodeValue).toBe('Seex');
  // A browser that says only where the caret is has one letter, or one word, deleted from there.
  label.nodeValue = 'See all 🏠 homes';
  for (const [kind, at, left] of [['deleteContentBackward', 10, 'See all  homes'], ['deleteWordBackward', 7, 'See   homes'], ['deleteContentForward', 0, 'ee   homes'], ['deleteWordForward', 2, 'ee'], ['deleteSoftLineBackward', 2, '']] as const) {
    before('#a', kind, [label, at, label, at]);
    expect(label.nodeValue).toBe(left);
  }
  label.nodeValue = 'Seex';
  // What is pasted goes in plain, on one line.
  const pasted = new page.InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertFromPaste' });
  Object.defineProperty(pasted, 'getTargetRanges', { value: () => [new page.StaticRange({ startContainer: label, startOffset: 3, endContainer: label, endOffset: 4 })] });
  Object.defineProperty(pasted, 'dataTransfer', { value: { getData: () => ' the\n  best' } });
  $('#a').dispatchEvent(pasted);
  expect(label.nodeValue).toBe('See the best');
  expect(before('#a', 'historyUndo', null).defaultPrevented).toBe(true);
  // The last words deleted leave the run where it is, and the next ones go into it.
  before('#a', 'deleteContentBackward', [label, 0, label, 12]);
  expect(label.isConnected).toBe(true);
  expect(words().at(-1)?.words).toBe('');
  page.getSelection()?.collapse($('#a'), 0);
  before('#a', 'insertText', [$('#a'), 0, $('#a'), 0], 'G');
  expect(label.nodeValue).toBe('G');
  expect(words().at(-1)?.words).toBe('G');
  // A new line or a look: nothing happens. A key pressed while the caret is in the next field's words goes to the end of these.
  down('#h');
  expect(before('#h', 'insertParagraph', null).defaultPrevented).toBe(true);
  expect(before('#h', 'formatBold', null).defaultPrevented).toBe(true);
  expect($('#h').innerHTML).toBe('Find your place <em>in Austin</em>');
  expect(before('#h', 'insertText', [run('em'), 2, run('em'), 2], 's').defaultPrevented).toBe(true);
  expect($('#h').innerHTML).toBe('Find your places <em>in Austin</em>');
});

it('leaves the space a template keeps between a heading\'s words and the next field\'s', () => {
  typingPage();
  down('#h');
  const title = run('#h');
  // The caret cannot go past the words into that space, and a space typed at their end is one that shows.
  page.getSelection()?.collapse(title, 16);
  page.document.dispatchEvent(new page.Event('selectionchange'));
  expect(page.getSelection()?.anchorOffset).toBe(15);
  expect(before('#h', 'insertText', [title, 15, title, 15], ' ').defaultPrevented).toBe(true);
  expect(title.nodeValue).toBe('Find your place\u00a0 ');
  // Deleting forward from the end of the words takes nothing of it.
  before('#h', 'deleteContentForward', [title, 16, title, 17]);
  expect(title.nodeValue).toBe('Find your place\u00a0 ');
  title.insertData(16, 'now');
  typed('#h');
  expect(words().at(-1)?.words).toBe('Find your place now');
  expect($('#h').textContent).toBe('Find your place\u00a0now in Austin');
  // An arrow into the next field's words stops at the end of these.
  page.getSelection()?.collapse(run('em'), 2);
  page.document.dispatchEvent(new page.Event('selectionchange'));
  expect(page.getSelection()?.anchorNode).toBe(title);
  expect(page.getSelection()?.anchorOffset).toBe(19);
});

it('ends the typing on Enter, and puts back what was there on Escape', () => {
  typingPage();
  down('#h');
  run('#h').nodeValue = 'Changed ';
  typed('#h');
  const escape = new page.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  $('#h').dispatchEvent(escape);
  expect(escape.defaultPrevented).toBe(true);
  expect(run('#h').nodeValue).toBe('Find your place ');
  expect(words().at(-1)?.words).toBe('Find your place');
  expect($('#h').hasAttribute('contenteditable')).toBe(false);

  down('#h');
  $('#h').dispatchEvent(new page.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  expect($('#h').hasAttribute('contenteditable')).toBe(false);
});

it('lets nothing be typed where the editor has not said so, in shaped text, in a button, or where the template marked the field itself', () => {
  typingPage();
  for (const selector of ['#body p', '#inb']) {
    down(selector);
    expect(page.document.querySelector('[contenteditable]')).toBeNull();
  }
  open(held('s1', [['title', 'Welcome'], ['price', '100']], '<h1 id="h">Welcome</h1><p id="p" data-cms-field="price">100</p>'));
  down('#h');
  hear({ source: 'velocity-cms', type: 'typable', places: { s1: ['price'] } });
  down('#h');
  down('#p');
  expect(page.document.querySelector('[contenteditable]')).toBeNull();
});

it('listens to nothing but the editor of this site', () => {
  hear({ source: 'velocity-cms', type: 'show', id: 's1' }, { origin: 'https://elsewhere.example' });
  hear({ source: 'velocity-cms', type: 'show', id: 's1' }, { source: page });
  hear({ source: 'something-else', type: 'show', id: 's1' });
  hear({ source: 'velocity-cms', type: 'show', id: 7 });
  hear({ source: 'velocity-cms', type: 'show', id: 'nowhere' });
  hear(null);
  expect(box('chosen').style.display).toBe('none');
});

it('stops a form on the page from being sent', () => {
  open('<div data-cms-section="s1"><form action="/x"><button>Send</button></form></div>');
  const event = new page.Event('submit', { bubbles: true, cancelable: true });
  $('form').dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
});

it('is sent to the page as text that stands alone', () => {
  expect(PREVIEW_BRIDGE_SCRIPT.startsWith('(function previewBridge(page)')).toBe(true);
  expect(PREVIEW_BRIDGE_SCRIPT.trimEnd().endsWith('(window);')).toBe(true);
  // Nothing of the module it was written in may be left in it.
  expect(PREVIEW_BRIDGE_SCRIPT).not.toMatch(/__vite|import\(|require\(/);
});

const TOOLS = {
  labels: { up: 'Move up', down: 'Move down', duplicate: 'Duplicate', remove: 'Remove', add: 'Add section', addBefore: 'Add a section above', addAfter: 'Add a section below' },
  sections: { s1: { name: 'Hero', up: false, down: true, copy: true, add: true }, s2: { name: 'List', up: true, down: false, copy: false, add: false } },
};
const pointAt = (selector: string) => $(selector).dispatchEvent(new page.MouseEvent('mouseover', { bubbles: true }));
const toolOf = (action: string) => $(`[data-cms-tool="${action}"]`) as HTMLButtonElement;
const acts = () => (said as [{ type: string; id: string; action: string }, string][]).map(([message]) => message).filter((message) => message.type === 'act');

it('shows no bar on a section until the editor says what can be done to it', () => {
  open();
  pointAt('h1');
  expect($('[data-cms-tools]').style.display).toBe('none');
  hear({ source: 'velocity-cms', type: 'tools', ...TOOLS });
  pointAt('h1');
  expect($('[data-cms-tools]').style.display).toBe('flex');
  expect($('[data-cms-tools]').textContent).toBe('Hero');
  expect(toolOf('addBefore').style.display).toBe('flex');
  expect(toolOf('addAfter').textContent).toBe('Add section');
  expect(toolOf('remove').title).toBe('Remove');
  // A page outside every section has no bar.
  pointAt('footer a');
  expect($('[data-cms-tools]').style.display).toBe('none');
});

it('says which button of the bar was pressed, changes nothing itself, and keeps the bar while the pointer is on it', () => {
  open();
  hear({ source: 'velocity-cms', type: 'tools', ...TOOLS });
  pointAt('h1');
  const before = page.document.body.innerHTML;
  pointAt('[data-cms-tool="down"]');
  expect($('[data-cms-tools]').style.display).toBe('flex');
  toolOf('down').click();
  toolOf('addAfter').click();
  expect(acts()).toEqual([
    { source: 'velocity-cms', type: 'act', id: 's1', action: 'down' },
    { source: 'velocity-cms', type: 'act', id: 's1', action: 'addAfter' },
  ]);
  // A press on the bar chooses no section.
  expect((said as [{ type: string }, string][]).filter(([message]) => message.type === 'section')).toHaveLength(0);
  expect(page.document.body.innerHTML).toBe(before);
});

it('leaves out what cannot be done: the first cannot go up, and a full page takes no more', () => {
  open();
  hear({ source: 'velocity-cms', type: 'tools', ...TOOLS });
  pointAt('h1');
  expect(toolOf('up').disabled).toBe(true);
  toolOf('up').click();
  pointAt('li');
  expect($('[data-cms-tools]').textContent).toBe('List');
  expect(toolOf('down').disabled).toBe(true);
  expect(toolOf('duplicate').disabled).toBe(true);
  expect(toolOf('addBefore').style.display).toBe('none');
  expect(acts()).toEqual([]);
});

it('puts the bar away while words are typed', () => {
  typingPage();
  hear({ source: 'velocity-cms', type: 'tools', labels: TOOLS.labels, sections: { s1: TOOLS.sections.s1 } });
  pointAt('#h');
  expect($('[data-cms-tools]').style.display).toBe('flex');
  down('#h');
  expect($('[data-cms-tools]').style.display).toBe('none');
});

/** Three sections, each 100 tall, one under the other. */
const stacked = () => {
  open('<main><div data-cms-section="a"><h2>A</h2></div><div data-cms-section="b"><h2>B</h2></div><div data-cms-section="c"><h2>C</h2></div></main>');
  const tops: Record<string, number> = { a: 0, b: 100, c: 200 };
  page.Element.prototype.getBoundingClientRect = function (this: HTMLElement) {
    const top = tops[this.closest<HTMLElement>('[data-cms-section]')?.dataset['cmsSection'] ?? ''] ?? 0;
    return { top, left: 0, width: 800, height: 100, bottom: top + 100, right: 800, x: 0, y: top, toJSON: () => ({}) };
  };
  const about = { name: 'Part', up: true, down: true, copy: true, add: true };
  hear({ source: 'velocity-cms', type: 'tools', labels: TOOLS.labels, sections: { a: about, b: about, c: about } });
};
const mouse = (type: string, target: Element | Document, clientY: number) => target.dispatchEvent(new page.MouseEvent(type, { bubbles: true, cancelable: true, clientY, button: 0 }));
const moves = () => (said as [{ type: string; id: string; before: string | null }, string][]).map(([message]) => message).filter((message) => message.type === 'move');

it('drags a section by its bar, shows where it would land, and says so when it is let go', () => {
  stacked();
  pointAt('[data-cms-section="a"] h2');
  mouse('mousedown', $('[data-cms-tool="drag"]'), 20);
  mouse('mousemove', page.document, 260);
  // Past the middle of the last section: after it.
  expect($('[data-cms-drop]').style.display).toBe('block');
  expect($('[data-cms-drop]').style.top).toBe('300px');
  mouse('mousemove', page.document, 220);
  expect($('[data-cms-drop]').style.top).toBe('200px');
  mouse('mouseup', page.document, 220);
  expect(moves()).toEqual([{ source: 'velocity-cms', type: 'move', id: 'a', before: 'c' }]);
  expect($('[data-cms-drop]').style.display).toBe('none');
  // The page itself is as it was: the editor moves the section.
  expect([...page.document.querySelectorAll<HTMLElement>('[data-cms-section]')].map((section) => section.dataset['cmsSection'])).toEqual(['a', 'b', 'c']);
});

it('moves nothing for a press that was only a press, a drop where the section already is, or Escape', () => {
  stacked();
  pointAt('[data-cms-section="b"] h2');
  mouse('mousedown', $('[data-cms-tool="drag"]'), 120);
  mouse('mouseup', page.document, 121);
  mouse('mousedown', $('[data-cms-tool="drag"]'), 120);
  mouse('mousemove', page.document, 160);
  expect($('[data-cms-drop]').style.display).toBe('none');
  mouse('mouseup', page.document, 160);
  mouse('mousedown', $('[data-cms-tool="drag"]'), 120);
  mouse('mousemove', page.document, 10);
  expect($('[data-cms-drop]').style.display).toBe('block');
  page.document.dispatchEvent(new page.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  mouse('mouseup', page.document, 10);
  expect(moves()).toEqual([]);
});

const PICTURES = `
  <main>
    <div data-cms-section="s1"><img data-cms-field="photo" src="/photos/porch.webp" alt=""><div class="shade">Over the photo</div></div>
    <div data-cms-section="s2"><p data-cms-field="text">Words</p></div>
  </main>`;
const moveTo = (selector: string, x: number, y: number) => {
  pointAt(selector);
  $(selector).dispatchEvent(new page.MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
};
const pictureTools = { labels: { ...TOOLS.labels, picture: 'Change photo' }, sections: { s1: { ...TOOLS.sections.s1, pictures: ['photo'] }, s2: TOOLS.sections.s2 } };

it('offers to change a picture the pointer is over, even under something the template lays on it, and says which when pressed', () => {
  open(PICTURES);
  moveTo('.shade', 50, 310);
  expect(toolOf('picture').style.display).toBe('none');
  hear({ source: 'velocity-cms', type: 'tools', ...pictureTools });
  moveTo('.shade', 50, 310);
  expect(toolOf('picture').style.display).toBe('flex');
  expect(toolOf('picture').textContent).toBe('Change photo');
  // The button is the layer's: the pointer on it keeps it.
  toolOf('picture').dispatchEvent(new page.MouseEvent('mousemove', { bubbles: true, clientX: 30, clientY: 310 }));
  toolOf('picture').click();
  expect((said as [{ type: string }, string][]).map(([message]) => message).filter((message) => message.type === 'picture')).toEqual([
    { source: 'velocity-cms', type: 'picture', id: 's1', field: 'photo' },
  ]);
  expect($('img').getAttribute('src')).toBe('/photos/porch.webp');
  // Away from the picture, and in a section with none, there is no button.
  moveTo('.shade', 500, 500);
  expect(toolOf('picture').style.display).toBe('none');
  moveTo('p', 50, 310);
  expect(toolOf('picture').style.display).toBe('none');
});

// A page in a frame here has no address of its own, so every link says its whole address.
const LINKS = `
  <main>
    <div data-cms-section="s1" data-cms-values='${JSON.stringify([
      ['label', 'See the menu'],
      ['to.kind', 'entry'],
      ['to.type', 'pages'],
      ['to.entry', 'g-menu'],
      ['more.kind', 'address'],
      ['more.href', 'https://example.com/book'],
      ['cards.0.to.kind', 'address'],
      ['cards.0.to.href', 'https://site.example/visit'],
      ['cards.1.to.kind', 'address'],
      ['cards.1.to.href', 'https://site.example/visit'],
    ])}'>
      <a class="menu" href="https://site.example/menu/?preview=1.abc">See the menu</a>
      <a class="book" href="https://example.com/book">Book</a>
      <a class="visit-1" href="https://site.example/visit/">One</a>
      <a class="visit-2" href="https://site.example/visit/">Two</a>
      <a class="other" href="https://site.example/elsewhere">Elsewhere</a>
    </div>
    <div data-cms-section="s2"><p data-cms-field="text">Words</p></div>
    <script type="application/json" data-cms-links>{"pages:g-menu":"https://site.example/menu"}</script>
  </main>`;
const linkTools = {
  labels: { ...TOOLS.labels, link: 'Edit link' },
  sections: { s1: { ...TOOLS.sections.s1, links: ['to', 'more', 'cards.0.to', 'cards.1.to', 'empty'] }, s2: TOOLS.sections.s2 },
};
const links = () => (said as [{ type: string; field?: string }, string][]).map(([message]) => message).filter((message) => message.type === 'link');

it('offers to edit a link the pointer is over, found by where it leads, and says which when pressed', () => {
  open(LINKS);
  moveTo('.menu', 50, 310);
  expect(toolOf('link').style.display).toBe('none');
  hear({ source: 'velocity-cms', type: 'tools', ...linkTools });
  // A link to an entry is found by the address the site says the entry has, whatever the preview added.
  moveTo('.menu', 50, 310);
  expect(toolOf('link').style.display).toBe('flex');
  expect(toolOf('link').textContent).toBe('Edit link');
  toolOf('link').dispatchEvent(new page.MouseEvent('mousemove', { bubbles: true, clientX: 30, clientY: 340 }));
  toolOf('link').click();
  expect(links()).toEqual([{ source: 'velocity-cms', type: 'link', id: 's1', field: 'to' }]);
  // The page is as it was: the link still goes where it went.
  expect($('.menu').getAttribute('href')).toBe('https://site.example/menu/?preview=1.abc');
  // Away from every link there is no button, nor in a section with none.
  moveTo('.menu', 500, 500);
  expect(toolOf('link').style.display).toBe('none');
  moveTo('p', 50, 310);
  expect(toolOf('link').style.display).toBe('none');
});

it('tells links that lead to one place apart by their order, and leaves alone a link no field holds', () => {
  open(LINKS);
  hear({ source: 'velocity-cms', type: 'tools', ...linkTools });
  // Each link is given a place of its own, so the pointer is over one at a time.
  const tops: Record<string, number> = { menu: 0, book: 100, 'visit-1': 200, 'visit-2': 300, other: 400 };
  page.Element.prototype.getBoundingClientRect = function (this: Element) {
    return rect(tops[this.className] ?? 1000);
  };
  for (const [name, top] of Object.entries(tops)) {
    moveTo(`.${name}`, 50, top + 10);
    if (toolOf('link').style.display === 'flex') toolOf('link').click();
  }
  expect(links().map((message) => message.field)).toEqual(['to', 'more', 'cards.0.to', 'cards.1.to']);
});

const ITEMS = `
  <main>
    <div data-cms-section="s1" data-cms-values='${JSON.stringify([
      ['title', 'Our menu'],
      ['cards.0.name', 'Soup'],
      ['cards.0.note', 'Warm'],
      ['cards.1.name', 'Bread'],
      ['cards.1.note', 'Fresh'],
    ])}'>
      <h2>Our menu</h2>
      <ul>
        <li class="card-0"><div><h3>Soup</h3><p>Warm</p></div></li>
        <li class="card-1"><div><h3>Bread</h3><p>Fresh</p></div></li>
      </ul>
    </div>
    <div data-cms-section="s2"><p data-cms-field="text">Words</p></div>
  </main>`;
const itemTools = {
  labels: { ...TOOLS.labels, itemUp: 'Move earlier', itemDown: 'Move later', itemDuplicate: 'Duplicate', itemRemove: 'Remove' },
  sections: { s1: { ...TOOLS.sections.s1, lists: [{ field: 'cards', count: 2, full: true }] }, s2: TOOLS.sections.s2 },
};
const itemTool = (action: string) => $(`[data-cms-item-tool="${action}"]`) as HTMLButtonElement;
const itemBar = () => $('[data-cms-item-tools]');
const items = () => (said as [{ type: string }, string][]).map(([message]) => message).filter((message) => message.type === 'item');

it('puts a bar on the item of a list the pointer is in, and says which button of which item was pressed', () => {
  open(ITEMS);
  // Each card has a place of its own; everything else is somewhere the pointer is not.
  const tops: Record<string, number> = { 'card-0': 0, 'card-1': 100 };
  page.Element.prototype.getBoundingClientRect = function (this: Element) {
    const card = this.closest('li');
    return rect(card ? (tops[card.className] ?? 1000) : this.hasAttribute('data-cms-section') ? 0 : 1000);
  };
  moveTo('.card-1 p', 50, 110);
  expect(itemBar().style.display).toBe('none');
  hear({ source: 'velocity-cms', type: 'tools', ...itemTools });
  moveTo('.card-1 p', 50, 110);
  expect(itemBar().style.display).toBe('flex');
  // The item is the whole card, not the words in it.
  expect($('[data-cms-outline="item"]').style.display).toBe('block');
  expect(itemTool('up').title).toBe('Move earlier');
  // The last item goes no later, and a full list takes no copy.
  expect(itemTool('up').disabled).toBe(false);
  expect(itemTool('down').disabled).toBe(true);
  expect(itemTool('duplicate').disabled).toBe(true);
  itemTool('down').click();
  itemTool('duplicate').click();
  itemTool('up').click();
  itemTool('remove').click();
  expect(items()).toEqual([
    { source: 'velocity-cms', type: 'item', id: 's1', field: 'cards', at: 1, action: 'up' },
    { source: 'velocity-cms', type: 'item', id: 's1', field: 'cards', at: 1, action: 'remove' },
  ]);
  // The page itself is as it was.
  expect(page.document.querySelectorAll('li')).toHaveLength(2);
  moveTo('.card-0 h3', 50, 10);
  expect(itemTool('up').disabled).toBe(true);
  expect(itemTool('down').disabled).toBe(false);
  // Outside every item there is no bar.
  moveTo('h2', 500, 500);
  expect(itemBar().style.display).toBe('none');
});
