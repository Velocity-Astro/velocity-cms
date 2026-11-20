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
 * - tools: a small bar on the section the pointer is in (move, copy, remove) and a button at each
 *   of its edges that adds a section there, all in the layer and all said to the editor, which
 *   makes the change
 * - events: what a pointer over the page and a click on it mean
 * - typing: words typed straight into a field on the page, said to the editor as they are typed
 * - scroll: the page stays where it was when it is drawn again
 *
 * A template says what is what with two attributes: `data-cms-section` holds a section's id, and
 * `data-cms-field` inside it holds a field's place in the section, as keys (`title`,
 * `items.0.text`). A page with no field marks still works: a section that says what it holds
 * (`data-cms-values`, a list of place and words) has its fields found by what they show, so a
 * template whose blocks hand their words to components of its own needs no mark on each. A mark
 * the template wrote always comes first, and a click that finds no field chooses the section.
 *
 * Words can be typed on the page only where the editor says a field holds plain words and the page
 * shows them exactly as they are held: the one run of text that shows them is changed, and nothing
 * else of the element can be.
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
  // The run of text that shows a field's words in an element, where there is exactly such a run.
  const runOf = new WeakMap<Element, Text>();
  // Every run that shows a field, by section and field, so all of them follow what is typed in one.
  const shownIn = new WeakMap<Element, Map<string, Text[]>>();
  const squeeze = (text: string | null): string => (text ?? '').replace(/\s+/g, '');
  const guess = (section: HTMLElement): Map<string, HTMLElement> => {
    const known = guesses.get(section);
    if (known) return known;
    const first = new Map<string, HTMLElement>();
    guesses.set(section, first);
    const shows = new Map<string, Text[]>();
    shownIn.set(section, shows);
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
    // Fields held as plain words, by what they say: only those can be typed on the page.
    const plain = new Map<string, string>();
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
      if (value[2] !== 'html') plain.set(path, words);
    }
    const claim = (element: HTMLElement, path: string): boolean => {
      if (!first.has(path)) first.set(path, element);
      if (guessed.has(element)) return false;
      guessed.set(element, path);
      return true;
    };
    for (const [words, paths] of wanted) {
      const elements = whole.get(words) ?? runs.get(words) ?? [];
      elements.forEach((element, at) => {
        const path = paths[Math.min(paths.length - 1, Math.floor((at * paths.length) / elements.length))] ?? '';
        if (!claim(element, path) || plain.get(path) !== words) return;
        const held = [...element.childNodes].filter((node): node is Text => node.nodeType === 3 && squeeze(node.nodeValue) === words);
        const run = held.length === 1 ? held[0] : undefined;
        if (!run) return;
        runOf.set(element, run);
        shows.set(path, [...(shows.get(path) ?? []), run]);
      });
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
  // The editor's own orange and the ink that goes on it (`--brand-500` and `--brand-ink` in the design
  // system's tokens), written out because the bridge can import nothing. What the editor draws on a
  // page looks like the editor, whatever the page's own colours are.
  const ACCENT = 'oklch(62.5% 0.22 38)';
  const ACCENT_INK = 'oklch(14% 0 0)';
  const layer = doc.createElement('div');
  layer.setAttribute('data-cms-layer', '');
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2147483647' });
  const outline = (name: string, width: string): HTMLElement => {
    const box = doc.createElement('div');
    box.setAttribute('data-cms-outline', name);
    Object.assign(box.style, { position: 'absolute', display: 'none', boxSizing: 'border-box', border: `${width} solid ${ACCENT}`, borderRadius: '4px' });
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
  let placeTools = (): void => undefined;
  const draw = (): void => {
    place(boxes.chosen, marks.chosen);
    // One outline is enough where the pointer is over what is chosen.
    place(boxes.over, marks.over && marks.over.element === marks.chosen?.element ? null : marks.over);
    placeTools();
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

  // Typing.
  let typable: Record<string, unknown> = {};
  interface Typing {
    readonly mark: Mark;
    readonly run: Text;
    readonly before: string;
    readonly was: string | null;
    readonly outline: string;
    /** How much of the run, at its start and at its end, is space the template left. */
    readonly lead: number;
    readonly trail: number;
  }
  let typing: Typing | null = null;
  /** The run of text words can be typed into for a mark, where the editor and the page both allow it. */
  const runFor = (mark: Mark | null): Text | null => {
    if (!mark || mark.field === undefined || mark.element.hasAttribute('data-cms-field')) return null;
    const places = typable[mark.section];
    if (!Array.isArray(places) || !places.includes(mark.field)) return null;
    // A button takes a space for a press, and a field of a form is the visitor's to fill.
    if (mark.element.closest('button, input, textarea, select, [contenteditable="false"]')) return null;
    const run = runOf.get(mark.element);
    return run?.isConnected ? run : null;
  };
  // Where the words are in the run being typed into: the space a template leaves around them (before the next words of a heading) is not theirs.
  const wordsAt = (now: Typing): [number, number] => [Math.min(now.lead, now.run.length), Math.max(now.lead, now.run.length - now.trail)];
  // Spaces in a row show as one, so they are held as one; a new line the field already had is kept.
  const wordsOf = (run: Text): string => (run.nodeValue ?? '').replace(/[ \t\u00a0]+/g, ' ').trim();
  const tellWords = (now: Typing): void => {
    const words = wordsOf(now.run);
    const section = now.mark.element.closest('[data-cms-section]');
    // The same field shown elsewhere in the section says the same.
    for (const other of (section && shownIn.get(section)?.get(now.mark.field ?? '')) ?? []) if (other !== now.run && other.isConnected) other.nodeValue = words;
    say({ type: 'words', id: now.mark.section, field: now.mark.field, words });
    redraw();
  };
  const stopTyping = (): void => {
    if (!typing) return;
    const { mark, was, outline } = typing;
    typing = null;
    mark.element.style.outline = outline;
    if (was === null) mark.element.removeAttribute('contenteditable');
    else mark.element.setAttribute('contenteditable', was);
    redraw();
  };
  const startTyping = (mark: Mark, run: Text): void => {
    if (typing?.mark.element === mark.element) return;
    stopTyping();
    const text = run.nodeValue ?? '';
    const lead = /^[ \t\n\r]*/.exec(text)?.[0].length ?? 0;
    const trail = lead === text.length ? 0 : (/[ \t\n\r]*$/.exec(text)?.[0].length ?? 0);
    typing = { mark, run, before: text, was: mark.element.getAttribute('contenteditable'), outline: mark.element.style.outline, lead, trail };
    mark.element.setAttribute('contenteditable', 'plaintext-only');
    // A browser that does not know plain text only is given the ordinary kind; what is pasted is made plain below.
    if (mark.element.contentEditable !== 'plaintext-only') mark.element.setAttribute('contenteditable', 'true');
    // The layer's outline says where the typing goes: the browser's own would sit under it.
    mark.element.style.outline = 'none';
    redraw();
  };
  // The element is made ready as the pointer goes down, so the caret lands where it was pressed.
  doc.addEventListener(
    'mousedown',
    (event) => {
      const mark = markOf(event.target);
      const run = runFor(mark);
      if (mark && run) startTyping(mark, run);
      else if (typing && !(isElement(event.target) && typing.mark.element.contains(event.target))) stopTyping();
    },
    true,
  );
  // The caret stays in the run: an arrow or End that would carry it into other words of the element stops at the run's edge.
  doc.addEventListener('selectionchange', () => {
    const selection = page.getSelection();
    if (!typing || !selection || selection.rangeCount === 0 || !typing.run.isConnected) return;
    const { run } = typing;
    const range = selection.getRangeAt(0);
    if (!typing.mark.element.contains(range.commonAncestorContainer)) return;
    const [from, to] = wordsAt(typing);
    const edge = (node: Node, offset: number): number | null => {
      if (node === run) return offset < from ? from : offset > to ? to : null;
      const point = doc.createRange();
      point.setStart(node, offset);
      return point.comparePoint(run, 0) === -1 ? to : from;
    };
    const start = edge(range.startContainer, range.startOffset);
    const end = edge(range.endContainer, range.endOffset);
    if (start === null && end === null) return;
    selection.setBaseAndExtent(run, start ?? range.startOffset, run, end ?? range.endOffset);
  });
  doc.addEventListener('focusout', (event) => {
    if (typing && event.target === typing.mark.element) stopTyping();
  });
  // Only the run of text that shows the field may change: what else the element holds (an icon, other words) stays.
  doc.addEventListener(
    'beforeinput',
    (event) => {
      if (!typing || !isElement(event.target) || !typing.mark.element.contains(event.target)) return;
      const { run } = typing;
      const kind = event.inputType;
      if (kind === 'insertParagraph' || kind === 'insertLineBreak' || kind.startsWith('format') || kind.startsWith('history') || kind === 'insertFromDrop') {
        event.preventDefault();
        return;
      }
      // What the change would touch: as the browser says, or else what is selected.
      const selection = page.getSelection();
      const said: readonly AbstractRange[] = event.getTargetRanges();
      const ranges = said.length > 0 ? said : selection && selection.rangeCount > 0 ? [selection.getRangeAt(0)] : [];
      if (ranges.length !== 1 || !ranges[0]) {
        event.preventDefault();
        return;
      }
      // The part of the words inside it. A change that would reach outside them is kept to them, and one
      // wholly outside (a key pressed before the caret was brought back) is made at their nearest end.
      const [from, to] = wordsAt(typing);
      const within = (node: Node, offset: number): number => {
        if (node === run) return Math.min(to, Math.max(from, offset));
        const point = doc.createRange();
        point.setStart(node, offset);
        return point.comparePoint(run, 0) === -1 ? to : from;
      };
      let start = within(ranges[0].startContainer, ranges[0].startOffset);
      let end = within(ranges[0].endContainer, ranges[0].endOffset);
      // A browser that does not say how much a key would delete says only where the caret is: the reach is worked out here.
      if (start === end && kind.startsWith('delete')) {
        const text = run.data;
        const pair = (at: number): number => (at >= 0 && at < text.length - 1 && text.charCodeAt(at) >= 0xd800 && text.charCodeAt(at) <= 0xdbff ? 2 : 1);
        if (kind.endsWith('Backward')) {
          const word = text.slice(from, start).search(/\S+\s*$/);
          start = kind.includes('Line') ? from : kind.includes('Word') ? from + Math.max(0, word) : Math.max(from, start - pair(start - 2));
        } else if (kind.endsWith('Forward')) {
          const word = /^\s*\S+/.exec(text.slice(end, to))?.[0].length ?? 0;
          end = kind.includes('Line') ? to : kind.includes('Word') ? end + word : Math.min(to, end + pair(end));
        }
      }
      // The change is made here and never by the browser, which would tidy the spaces around the words and take an emptied run away.
      event.preventDefault();
      // What is pasted, or put in place of a word, goes in as plain words on one line.
      const data = kind.startsWith('delete') ? '' : (event.data ?? event.dataTransfer?.getData('text/plain').replace(/\s+/g, ' '));
      if (typeof data !== 'string' || (start === end && data === '')) return;
      // A space typed at either end of the words would be lost among the template's own, so it is one that shows.
      const added = data === ' ' && (start === from || end === to) ? '\u00a0' : data;
      run.replaceData(start, end - start, added);
      selection?.collapse(run, start + added.length);
      tellWords(typing);
    },
    true,
  );
  doc.addEventListener(
    'input',
    (event) => {
      if (typing && isElement(event.target) && typing.mark.element.contains(event.target) && typing.run.isConnected) tellWords(typing);
    },
    true,
  );
  doc.addEventListener(
    'keydown',
    (event) => {
      if (!typing || event.isComposing) return;
      if (event.key !== 'Enter' && event.key !== 'Escape') return;
      event.preventDefault();
      const now = typing;
      // Escape puts back what the field said when the typing began.
      if (event.key === 'Escape' && now.run.isConnected && now.run.nodeValue !== now.before) {
        now.run.nodeValue = now.before;
        tellWords(now);
      }
      now.mark.element.blur();
      stopTyping();
    },
    true,
  );

  // Tools.
  interface Tools {
    readonly labels: Record<string, unknown>;
    readonly sections: Record<string, { readonly name?: unknown; readonly up?: unknown; readonly down?: unknown; readonly copy?: unknown; readonly add?: unknown } | undefined>;
  }
  let tools: Tools | null = null;
  // The section the bar is for: the one the pointer was last in, and it stays while the pointer is on the bar itself.
  let tooled: HTMLElement | null = null;
  // Lucide's drawings, as the lines they are made of: the bridge can import nothing.
  const DRAWN: Record<string, readonly string[]> = {
    up: ['m5 12 7-7 7 7', 'M12 19V5'],
    down: ['M12 5v14', 'm19 12-7 7-7-7'],
    duplicate: ['M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z', 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2'],
    remove: ['M3 6h18', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2', 'M10 11v6', 'M14 11v6'],
    add: ['M5 12h14', 'M12 5v14'],
    drag: ['M9 5h.01', 'M9 12h.01', 'M9 19h.01', 'M15 5h.01', 'M15 12h.01', 'M15 19h.01'],
  };
  const drawing = (name: string): SVGElement => {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries({ viewBox: '0 0 24 24', width: '16', height: '16', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }))
      svg.setAttribute(key, value);
    for (const line of DRAWN[name] ?? []) {
      const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', line);
      svg.append(path);
    }
    return svg;
  };
  const FONT = 'system-ui, sans-serif';
  const bar = doc.createElement('div');
  bar.setAttribute('data-cms-tools', '');
  Object.assign(bar.style, {
    position: 'absolute',
    display: 'none',
    alignItems: 'center',
    gap: '2px',
    padding: '4px',
    borderRadius: '8px',
    background: 'CanvasText',
    color: 'Canvas',
    font: `500 12px/1 ${FONT}`,
    boxShadow: '0 4px 12px rgb(0 0 0 / 0.25)',
    pointerEvents: 'auto',
  });
  const grip = doc.createElement('span');
  grip.setAttribute('data-cms-tool', 'drag');
  Object.assign(grip.style, { display: 'grid', placeItems: 'center', width: '20px', height: '28px', cursor: 'grab' });
  grip.append(drawing('drag'));
  bar.append(grip);
  const named = doc.createElement('span');
  Object.assign(named.style, { padding: '0 8px 0 2px', cursor: 'grab', maxWidth: '12rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
  bar.append(named);
  const press = (button: HTMLButtonElement, action: string): void => {
    // The pointer going down must not take the caret from the page or start a selection.
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      const id = tooled?.dataset['cmsSection'];
      if (id && !button.disabled) say({ type: 'act', id, action });
    });
  };
  const tool = (action: string): HTMLButtonElement => {
    const button = doc.createElement('button');
    button.type = 'button';
    // The bar is for a pointer: the same things are in the form for a keyboard and a screen reader.
    button.tabIndex = -1;
    button.setAttribute('data-cms-tool', action);
    Object.assign(button.style, { display: 'grid', placeItems: 'center', width: '28px', height: '28px', padding: '0', border: '0', borderRadius: '6px', background: 'transparent', color: 'inherit', cursor: 'pointer' });
    button.append(drawing(action));
    press(button, action);
    bar.append(button);
    return button;
  };
  const buttons = { up: tool('up'), down: tool('down'), duplicate: tool('duplicate'), remove: tool('remove') };
  const adder = (action: string): HTMLButtonElement => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.tabIndex = -1;
    button.setAttribute('data-cms-tool', action);
    Object.assign(button.style, {
      position: 'absolute',
      display: 'none',
      alignItems: 'center',
      gap: '4px',
      height: '28px',
      padding: '0 12px 0 8px',
      border: '0',
      borderRadius: '14px',
      background: ACCENT,
      color: ACCENT_INK,
      font: `600 12px/1 ${FONT}`,
      boxShadow: '0 4px 12px rgb(0 0 0 / 0.25)',
      transform: 'translate(-50%, -50%)',
      whiteSpace: 'nowrap',
      cursor: 'pointer',
      pointerEvents: 'auto',
    });
    button.append(drawing('add'), doc.createElement('span'));
    press(button, action);
    layer.append(button);
    return button;
  };
  const adders = { addBefore: adder('addBefore'), addAfter: adder('addAfter') };
  layer.append(bar);
  const word = (value: unknown): string => (typeof value === 'string' ? value : '');
  placeTools = (): void => {
    const hide = (): void => {
      bar.style.display = 'none';
      adders.addBefore.style.display = 'none';
      adders.addAfter.style.display = 'none';
    };
    // While words are typed, nothing sits over them.
    const section = typing || drag?.moved ? null : tooled?.isConnected ? tooled : null;
    const about = section && tools?.sections[section.dataset['cmsSection'] ?? ''];
    if (!section || !tools || !about) return hide();
    const rect = section.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= page.innerHeight || (rect.width === 0 && rect.height === 0)) return hide();
    named.textContent = word(about.name);
    const able: Record<keyof typeof buttons, boolean> = { up: about.up === true, down: about.down === true, duplicate: about.copy === true, remove: true };
    for (const action of ['up', 'down', 'duplicate', 'remove'] as const) {
      const button = buttons[action];
      button.title = word(tools.labels[action]);
      button.disabled = !able[action];
      button.style.opacity = able[action] ? '1' : '0.4';
      button.style.cursor = able[action] ? 'pointer' : 'default';
    }
    // At the section's top corner, and at the top of the page while the section's own top is above it.
    Object.assign(bar.style, { display: 'flex', top: `${Math.min(Math.max(rect.top, 0) + 12, Math.max(rect.bottom - 44, 0))}px`, left: 'auto', right: `${Math.max(page.innerWidth - rect.right, 0) + 12}px` });
    for (const [action, edge] of [['addBefore', rect.top], ['addAfter', rect.bottom]] as const) {
      const button = adders[action];
      // An edge that is off the page, or a page that takes no more sections, has no button.
      const shown = about.add === true && edge >= 14 && edge <= page.innerHeight - 14;
      button.style.display = shown ? 'flex' : 'none';
      if (!shown) continue;
      if (button.lastElementChild) button.lastElementChild.textContent = word(tools.labels['add']);
      button.title = word(tools.labels[action]);
      Object.assign(button.style, { top: `${edge}px`, left: `${rect.left + rect.width / 2}px` });
    }
  };

  // Dragging a section by its bar: a line shows where it would land, and letting go says so to the editor.
  const line = doc.createElement('div');
  line.setAttribute('data-cms-drop', '');
  Object.assign(line.style, { position: 'absolute', display: 'none', left: '0', right: '0', height: '4px', marginTop: '-2px', borderRadius: '2px', background: ACCENT, boxShadow: '0 0 0 1px Canvas' });
  layer.append(line);
  interface Drag {
    readonly id: string;
    readonly from: number;
    y: number;
    /** The section it would land before, or `null` for after the last; `undefined` where it would not move. */
    before: string | null | undefined;
    moved: boolean;
  }
  let drag: Drag | null = null;
  const movable = (): HTMLElement[] => [...doc.querySelectorAll<HTMLElement>('[data-cms-section]')].filter((section) => tools?.sections[section.dataset['cmsSection'] ?? ''] !== undefined);
  const aim = (): void => {
    if (!drag) return;
    const sections = movable();
    const at = sections.findIndex((section) => {
      const rect = section.getBoundingClientRect();
      return drag !== null && drag.y < rect.top + rect.height / 2;
    });
    const target = at < 0 ? undefined : sections[at];
    const own = sections.findIndex((section) => section.dataset['cmsSection'] === drag?.id);
    const to = at < 0 ? sections.length : at;
    // Before itself, or before the one after it, is where it is already.
    drag.before = own < 0 || to === own || to === own + 1 ? undefined : (target?.dataset['cmsSection'] ?? null);
    const last = sections[sections.length - 1];
    const edge = target ? target.getBoundingClientRect().top : (last?.getBoundingClientRect().bottom ?? 0);
    Object.assign(line.style, { display: drag.before === undefined ? 'none' : 'block', top: `${Math.min(Math.max(edge, 2), page.innerHeight - 2)}px` });
  };
  const endDrag = (drop: boolean): void => {
    if (!drag) return;
    const { id, before, moved } = drag;
    drag = null;
    line.style.display = 'none';
    Object.assign(layer.style, { pointerEvents: 'none', cursor: '' });
    if (drop && moved && before !== undefined) say({ type: 'move', id, before });
    draw();
  };
  // Near the top or the bottom of the page, it scrolls to bring the rest within reach.
  const creep = (): void => {
    if (!drag) return;
    const by = drag.y < 72 ? -14 : drag.y > page.innerHeight - 72 ? 14 : 0;
    if (by !== 0 && drag.moved) {
      page.scrollBy(0, by);
      aim();
    }
    page.setTimeout(creep, 16);
  };
  for (const handle of [grip, named]) {
    handle.addEventListener('mousedown', (event) => {
      const id = tooled?.dataset['cmsSection'];
      if (event.button !== 0 || !id || movable().length < 2) return;
      event.preventDefault();
      drag = { id, from: event.clientY, y: event.clientY, before: undefined, moved: false };
      // The layer takes the pointer while it drags, so nothing on the page answers to it.
      Object.assign(layer.style, { pointerEvents: 'auto', cursor: 'grabbing' });
      page.setTimeout(creep, 16);
    });
  }
  doc.addEventListener(
    'mousemove',
    (event) => {
      if (!drag) return;
      drag.y = event.clientY;
      // A few pixels of give, so a press that was only a press moves nothing.
      if (Math.abs(drag.y - drag.from) > 4) drag.moved = true;
      if (drag.moved) aim();
    },
    true,
  );
  doc.addEventListener('mouseup', () => endDrag(true), true);
  doc.documentElement.addEventListener('mouseleave', () => endDrag(false));
  doc.addEventListener(
    'keydown',
    (event) => {
      if (drag && event.key === 'Escape') endDrag(false);
    },
    true,
  );

  // Events.
  doc.addEventListener('mouseover', (event) => {
    // Over the layer's own bar and buttons, what they are for stays as it was.
    if (isElement(event.target) && layer.contains(event.target)) return;
    marks.over = markOf(event.target);
    if (marks.over) marks.over.element.style.cursor = runFor(marks.over) ? 'text' : 'pointer';
    tooled = isElement(event.target) ? event.target.closest<HTMLElement>('[data-cms-section]') : null;
    draw();
  });
  doc.documentElement.addEventListener('mouseleave', () => {
    marks.over = null;
    tooled = null;
    draw();
  });
  // Nothing on the page goes anywhere: a click chooses what it is on.
  doc.addEventListener(
    'click',
    (event) => {
      event.preventDefault();
      // A press on the layer's own bar is that button's business.
      if (isElement(event.target) && layer.contains(event.target)) return;
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
    if (event.data.type === 'typable') {
      const places = (event.data as { places?: unknown }).places;
      typable = typeof places === 'object' && places !== null ? (places as Record<string, unknown>) : {};
      return;
    }
    if (event.data.type === 'tools') {
      const said = event.data as { labels?: unknown; sections?: unknown };
      const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
      tools = isRecord(said.labels) && isRecord(said.sections) ? { labels: said.labels, sections: said.sections as Tools['sections'] } : null;
      draw();
      return;
    }
    if (event.data.type !== 'show' || typeof event.data.id !== 'string') return;
    // While words are typed into a section, the outline stays on the field they go into.
    if (typing?.mark.section === event.data.id) return;
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
