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
 * `items.0.text`). A page with no field marks still works: a click chooses the section.
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
  const markOf = (target: unknown): Mark | null => {
    if (!isElement(target)) return null;
    const section = target.closest<HTMLElement>('[data-cms-section]');
    const id = section?.dataset['cmsSection'];
    if (!section || !id) return null;
    const field = target.closest<HTMLElement>('[data-cms-field]');
    const path = field?.dataset['cmsField'];
    // A field counts only inside the section the pointer is in.
    return field && path && section.contains(field) ? { element: field, section: id, field: path } : { element: section, section: id };
  };
  const find = (section: string, field?: string): Mark | null => {
    const found = [...doc.querySelectorAll<HTMLElement>('[data-cms-section]')].find((candidate) => candidate.dataset['cmsSection'] === section);
    if (!found) return null;
    if (field !== undefined) {
      const inner = [...found.querySelectorAll<HTMLElement>('[data-cms-field]')].find((candidate) => candidate.dataset['cmsField'] === field);
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
