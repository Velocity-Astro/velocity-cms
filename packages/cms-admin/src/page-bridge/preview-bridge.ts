/**
 * What the page beside the editor's form runs: the page's side of the conversation with the
 * editor. It is sent to the browser as text (`PREVIEW_BRIDGE_SCRIPT`), so the function must stand
 * alone: its argument only, no imports and nothing from this file.
 *
 * It is in parts, each a few functions that close over the same page:
 *
 * - messaging: what the page and the editor say to each other, and to nobody else
 * - marks: which section, and which field of it, an element of the page belongs to
 * - layer: outlines drawn above the page, so nothing of the template's own markup is changed
 * - events: what a pointer over the page and a click on it mean
 * - scroll: the page stays where it was when it is drawn again
 *
 * A template says what is what with two attributes: `data-cms-section` holds a section's id, and
 * `data-cms-field` inside it holds a field's place in the section, as keys (`title`,
 * `items.0.text`). A page with no field marks still works: a section that says what it holds
 * (`data-cms-values`, a list of place and words) has its fields found by what they show, so a
 * template whose blocks hand their words to components of its own needs no mark on each. A mark
 * the template wrote always comes first, and a click that finds no field chooses the section.
 *
 * The layer's look is set from script, which a page's content rules allow where a style written
 * into the page would not be.
 */
export function previewBridge(page: Window & typeof globalThis): void {
  if (page.parent === page) return;
  const doc = page.document;
  const origin = page.location.origin;
  const SOURCE = 'velocity-cms';

  // Messaging.
  const say = (message: Record<string, unknown>): void => page.parent.postMessage({ source: SOURCE, ...message }, origin);

  // Marks.
  interface Mark {
    readonly element: HTMLElement;
    readonly section: string;
    readonly field?: string;
  }
  const isElement = (target: unknown): target is Element => typeof target === 'object' && target !== null && (target as Node).nodeType === 1;
  // What a section's fields were found to be by what they show: nothing is written on the page.
  const guessed = new WeakMap<Element, string>();
  const guesses = new WeakMap<Element, Map<string, HTMLElement>>();
  const squeeze = (text: string | null): string => (text ?? '').replace(/\s+/g, '');
  const guess = (section: HTMLElement): Map<string, HTMLElement> => {
    const known = guesses.get(section);
    if (known) return known;
    const first = new Map<string, HTMLElement>();
    guesses.set(section, first);
    let values: unknown;
    try {
      values = JSON.parse(section.dataset['cmsValues'] ?? '[]');
    } catch {
      return first;
    }
    if (!Array.isArray(values)) return first;
    // Each element by all it says (the innermost of those that say the same), and by each run of words in it.
    const whole = new Map<string, HTMLElement[]>();
    const runs = new Map<string, HTMLElement[]>();
    const pictures: HTMLImageElement[] = [];
    const add = (into: Map<string, HTMLElement[]>, text: string, element: HTMLElement): void => {
      if (text === '') return;
      const list = into.get(text) ?? [];
      const last = list[list.length - 1];
      if (last === element) return;
      if (last?.contains(element)) list[list.length - 1] = element;
      else list.push(element);
      into.set(text, list);
    };
    for (const element of section.querySelectorAll<HTMLElement>('*')) {
      if (element.closest('script, style, template, noscript')) continue;
      if (element.tagName === 'IMG') pictures.push(element as HTMLImageElement);
      add(whole, squeeze(element.textContent), element);
      for (const node of element.childNodes) if (node.nodeType === 3) add(runs, squeeze(node.nodeValue), element);
    }
    // Fields that say the same words share the elements that show them, in order.
    const wanted = new Map<string, string[]>();
    const sources: [string, string][] = [];
    for (const value of values) {
      if (!Array.isArray(value) || typeof value[0] !== 'string' || typeof value[1] !== 'string') continue;
      const path: string = value[0];
      if ([...section.querySelectorAll<HTMLElement>('[data-cms-field]')].some((marked) => marked.dataset['cmsField'] === path)) continue;
      let text: string = value[1];
      if (value[2] === 'html') {
        const holder = doc.createElement('template');
        holder.innerHTML = text;
        text = holder.content.textContent ?? '';
      } else if (text.length > 1 && !/\s/.test(text)) {
        sources.push([path, text]);
      }
      const words = squeeze(text);
      if (words !== '') wanted.set(words, [...(wanted.get(words) ?? []), path]);
    }
    const claim = (element: HTMLElement, path: string): void => {
      if (!guessed.has(element)) guessed.set(element, path);
      if (!first.has(path)) first.set(path, element);
    };
    for (const [words, paths] of wanted) {
      const elements = whole.get(words) ?? runs.get(words) ?? [];
      elements.forEach((element, at) => claim(element, paths[Math.min(paths.length - 1, Math.floor((at * paths.length) / elements.length))] ?? ''));
    }
    // A picture is found by its name in its address: a whole part of it, not letters inside a longer name.
    const names = (address: string): string => {
      try {
        return decodeURIComponent(address);
      } catch {
        return address;
      }
    };
    for (const [path, name] of sources) {
      if (first.has(path)) continue;
      for (const picture of pictures) {
        const address = names(picture.getAttribute('src') ?? '');
        const at = address.indexOf(name);
        if (at < 0) continue;
        const before = name.startsWith('/') || at === 0 ? '/' : (address[at - 1] ?? '');
        const after = address[at + name.length] ?? '';
        if ((before === '/' || before === '=') && (after === '' || './?&'.includes(after))) claim(picture, path);
      }
    }
    return first;
  };
  const markOf = (target: unknown): Mark | null => {
    if (!isElement(target)) return null;
    const section = target.closest<HTMLElement>('[data-cms-section]');
    const id = section?.dataset['cmsSection'];
    if (!section || !id) return null;
    guess(section);
    // A field counts only inside the section the pointer is in, and the nearest one is meant.
    for (let element: Element | null = target; element && element !== section; element = element.parentElement) {
      const path = (element as HTMLElement).dataset?.['cmsField'] ?? guessed.get(element);
      if (path) return { element: element as HTMLElement, section: id, field: path };
    }
    return { element: section, section: id };
  };
  const find = (section: string, field?: string): Mark | null => {
    const found = [...doc.querySelectorAll<HTMLElement>('[data-cms-section]')].find((candidate) => candidate.dataset['cmsSection'] === section);
    if (!found) return null;
    if (field !== undefined) {
      const inner = [...found.querySelectorAll<HTMLElement>('[data-cms-field]')].find((candidate) => candidate.dataset['cmsField'] === field) ?? guess(found).get(field);
      if (inner) return { element: inner, section, field };
    }
    return { element: found, section };
  };

  // Layer.
  const layer = doc.createElement('div');
  layer.setAttribute('data-cms-layer', '');
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2147483647' });
  const outline = (name: string, width: string): HTMLElement => {
    const box = doc.createElement('div');
    box.setAttribute('data-cms-outline', name);
    Object.assign(box.style, { position: 'absolute', display: 'none', boxSizing: 'border-box', border: `${width} solid Highlight`, borderRadius: '4px' });
    layer.append(box);
    return box;
  };
  const boxes = { over: outline('over', '1px'), chosen: outline('chosen', '2px') };
  const marks: { over: Mark | null; chosen: Mark | null } = { over: null, chosen: null };
  const place = (box: HTMLElement, mark: Mark | null): void => {
    // A mark whose element has left the page, or has no size, is not drawn.
    const rect = mark?.element.isConnected ? mark.element.getBoundingClientRect() : null;
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      box.style.display = 'none';
      return;
    }
    Object.assign(box.style, { display: 'block', top: `${rect.top}px`, left: `${rect.left}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  };
  const draw = (): void => {
    place(boxes.chosen, marks.chosen);
    // One outline is enough where the pointer is over what is chosen.
    place(boxes.over, marks.over && marks.over.element === marks.chosen?.element ? null : marks.over);
  };
  let waiting = false;
  const redraw = (): void => {
    if (waiting) return;
    waiting = true;
    page.requestAnimationFrame(() => {
      waiting = false;
      draw();
    });
  };
  doc.documentElement.append(layer);
  page.addEventListener('scroll', redraw, { capture: true, passive: true });
  page.addEventListener('resize', redraw);
  // Pictures arrive and fonts change after the page is drawn, and move what is outlined.
  if (typeof page.ResizeObserver === 'function') new page.ResizeObserver(redraw).observe(doc.documentElement);

  // Events.
  doc.addEventListener('mouseover', (event) => {
    marks.over = markOf(event.target);
    if (marks.over) marks.over.element.style.cursor = 'pointer';
    draw();
  });
  doc.documentElement.addEventListener('mouseleave', () => {
    marks.over = null;
    draw();
  });
  // Nothing on the page goes anywhere: a click chooses what it is on.
  doc.addEventListener(
    'click',
    (event) => {
      event.preventDefault();
      const mark = markOf(event.target);
      if (!mark) return;
      marks.chosen = mark;
      draw();
      say({ type: 'section', id: mark.section, ...(mark.field !== undefined && { field: mark.field }) });
    },
    true,
  );
  doc.addEventListener('submit', (event) => event.preventDefault(), true);

  page.addEventListener('message', (event: MessageEvent<{ source?: unknown; type?: unknown; id?: unknown; field?: unknown } | null>) => {
    if (event.origin !== origin || event.source !== page.parent || event.data?.source !== SOURCE) return;
    if (event.data.type !== 'show' || typeof event.data.id !== 'string') return;
    const mark = find(event.data.id, typeof event.data.field === 'string' ? event.data.field : undefined);
    if (!mark) return;
    marks.chosen = mark;
    const rect = mark.element.getBoundingClientRect();
    // What is already in view stays where it is: the page does not jump while someone types.
    if (rect.bottom <= 0 || rect.top >= page.innerHeight) {
      // Room for a header that stays at the top of the page.
      mark.element.style.scrollMarginTop = '6rem';
      mark.element.scrollIntoView({ block: 'start' });
    }
    draw();
  });

  // Scroll.
  const key = `velocity-cms:scroll:${page.location.pathname}`;
  try {
    const kept = Number(page.sessionStorage.getItem(key));
    if (kept > 0) page.scrollTo({ top: kept, behavior: 'instant' });
    page.addEventListener('pagehide', () => page.sessionStorage.setItem(key, String(page.scrollY)));
  } catch {
    // A page that may not keep anything starts at the top.
  }

  say({ type: 'ready' });
}

/** The bridge as the page is sent it. */
export const PREVIEW_BRIDGE_SCRIPT = `(${previewBridge.toString()})(window);\n`;
