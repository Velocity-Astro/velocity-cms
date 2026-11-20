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
