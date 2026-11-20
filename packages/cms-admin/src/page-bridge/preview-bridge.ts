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
 * - tools: a small bar on the section the pointer is in (move, copy, remove), a button at each
 *   of its edges that adds a section there, and a button on a picture or a link the editor can
 *   change, all in the layer and all said to the editor, which makes the change
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
  // What a section holds itself: a section inside it (a column's) answers for its own.
  const within = (section: HTMLElement, selector: string): HTMLElement[] =>
    [...section.querySelectorAll<HTMLElement>(selector)].filter((element) => element.closest('[data-cms-section]') === section);
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
    for (const element of within(section, '*')) {
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
      if (within(section, '[data-cms-field]').some((marked) => marked.dataset['cmsField'] === path)) continue;
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
    // Everything inside text being written is that text, whatever was written into it since.
    if (writing?.mark.element.contains(target)) return writing.mark;
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
      const inner = within(found, '[data-cms-field]').find((candidate) => candidate.dataset['cmsField'] === field) ?? guess(found).get(field);
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
    stopWriting();
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

  // Writing: text shaped in the editor (paragraphs, bold, links) is written where the page shows
  // it exactly as it is held. The browser does the writing in that one element, the page says
  // what it now holds, and the editor keeps of it only what the format keeps.
  interface Writing {
    readonly mark: Mark;
    readonly before: string;
    readonly was: string | null;
    readonly outline: string;
  }
  let writing: Writing | null = null;
  // The words a link's address is being asked for, while the editor asks.
  let asking: Range | null = null;
  // A link as the field holds it: without what a preview adds to links that stay on the site.
  const withoutPreview = (href: string): string =>
    /^[a-z][a-z0-9+.-]*:/i.test(href) ? href : href.replace(/([?&])preview=[^&#]*(&)?/, (_all, lead: string, more?: string) => (more ? lead : ''));
  const htmlOf = (element: HTMLElement): string => {
    const copy = element.cloneNode(true) as HTMLElement;
    for (const anchor of copy.querySelectorAll('a[href]')) anchor.setAttribute('href', withoutPreview(anchor.getAttribute('href') ?? ''));
    return copy.innerHTML;
  };
  /** The element that shows a field's formatted text exactly as it is held, where the editor lets it be written on the page. */
  const holderFor = (mark: Mark | null): HTMLElement | null => {
    if (!mark || mark.field === undefined || mark.element.hasAttribute('data-cms-field')) return null;
    const places = typable[mark.section];
    if (!Array.isArray(places) || !places.includes(mark.field)) return null;
    const section = mark.element.closest<HTMLElement>('[data-cms-section]');
    if (!section) return null;
    let held: string | null = null;
    try {
      const values: unknown = JSON.parse(section.dataset['cmsValues'] ?? '[]');
      const value = (Array.isArray(values) ? values : []).find((candidate: unknown) => Array.isArray(candidate) && candidate[0] === mark.field && candidate[2] === 'html') as unknown[] | undefined;
      if (typeof value?.[1] === 'string') {
        // Read as a browser reads it, and never drawn: nothing in it runs.
        const read = doc.createElement('template');
        read.innerHTML = value[1];
        held = read.innerHTML;
      }
    } catch {
      return null;
    }
    if (held === null) return null;
    for (let element: HTMLElement | null = mark.element; element && element !== section; element = element.parentElement) {
      if (htmlOf(element) === held) return element.closest('button, input, textarea, select, [contenteditable="false"]') ? null : element;
    }
    return null;
  };
  let placeFormat = (): void => undefined;
  const tellWriting = (now: Writing): void => {
    say({ type: 'words', id: now.mark.section, field: now.mark.field, words: htmlOf(now.mark.element) });
    redraw();
  };
  const stopWriting = (): void => {
    if (!writing) return;
    const { mark, was, outline } = writing;
    writing = null;
    asking = null;
    mark.element.style.outline = outline;
    if (was === null) mark.element.removeAttribute('contenteditable');
    else mark.element.setAttribute('contenteditable', was);
    redraw();
  };
  const startWriting = (mark: Mark): void => {
    if (writing?.mark.element === mark.element) return;
    stopTyping();
    stopWriting();
    writing = { mark, before: mark.element.innerHTML, was: mark.element.getAttribute('contenteditable'), outline: mark.element.style.outline };
    mark.element.setAttribute('contenteditable', 'true');
    mark.element.style.outline = 'none';
    marks.chosen = mark;
    redraw();
  };
  doc.addEventListener(
    'mousedown',
    (event) => {
      if (isElement(event.target) && (layer.contains(event.target) || writing?.mark.element.contains(event.target))) return;
      const mark = markOf(event.target);
      const holder = holderFor(mark);
      if (mark && holder && mark.field !== undefined) startWriting({ element: holder, section: mark.section, field: mark.field });
      else stopWriting();
    },
    true,
  );
  doc.addEventListener('focusout', (event) => {
    // While the editor asks where a link leads, the page is left and come back to.
    if (writing && !asking && event.target === writing.mark.element) stopWriting();
  });
  doc.addEventListener(
    'beforeinput',
    (event) => {
      // Nothing is dragged into the text from elsewhere on the page.
      if (writing && isElement(event.target) && writing.mark.element.contains(event.target) && event.inputType === 'insertFromDrop') event.preventDefault();
    },
    true,
  );
  doc.addEventListener(
    'paste',
    (event) => {
      if (!writing || !isElement(event.target) || !writing.mark.element.contains(event.target)) return;
      // What is pasted goes in as words alone: the markup of wherever it came from stays there.
      event.preventDefault();
      const words = event.clipboardData?.getData('text/plain') ?? '';
      if (words !== '') doc.execCommand('insertText', false, words);
    },
    true,
  );
  doc.addEventListener(
    'input',
    (event) => {
      if (writing && isElement(event.target) && writing.mark.element.contains(event.target)) tellWriting(writing);
    },
    true,
  );
  doc.addEventListener(
    'keydown',
    (event) => {
      if (!writing || event.isComposing || event.key !== 'Escape') return;
      event.preventDefault();
      const now = writing;
      // Escape puts back what the field said when the writing began.
      if (now.mark.element.innerHTML !== now.before) {
        now.mark.element.innerHTML = now.before;
        tellWriting(now);
      }
      stopWriting();
      now.mark.element.blur();
    },
    true,
  );
  doc.addEventListener('selectionchange', () => placeFormat());

  // Undo and redo are the form's: the page says the keys were pressed and takes nothing back
  // itself. Formatted text being written is the browser's to take back, as it is to write.
  doc.addEventListener(
    'keydown',
    (event) => {
      if (writing || event.isComposing || event.altKey || !(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      const asked = key === 'z' ? (event.shiftKey ? 'redo' : 'undo') : key === 'y' && event.ctrlKey && !event.shiftKey ? 'redo' : null;
      if (asked === null) return;
      // A field of a form on the page is the visitor's, and the browser's to take back.
      if (!typing && isElement(event.target) && event.target.closest('input, textarea, select, [contenteditable]')) return;
      event.preventDefault();
      if (typing) {
        typing.mark.element.blur();
        stopTyping();
      }
      say({ type: asked });
    },
    true,
  );

  // Tools.
  interface Tools {
    readonly labels: Record<string, unknown>;
    readonly sections: Record<string, { readonly name?: unknown; readonly up?: unknown; readonly down?: unknown; readonly copy?: unknown; readonly add?: unknown; readonly pictures?: unknown; readonly links?: unknown; readonly lists?: unknown; readonly swatches?: unknown; readonly list?: unknown; readonly group?: unknown } | undefined>;
    /** The places inside sections that hold sections of their own, by `<section>:<field>`. */
    readonly slots?: Record<string, { readonly group?: unknown; readonly empty?: unknown; readonly full?: unknown } | undefined>;
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
    picture: ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M11 9a2 2 0 1 1-4 0 2 2 0 0 1 4 0z', 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21'],
    link: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
    bold: ['M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8'],
    italic: ['M19 4h-9', 'M14 20H5', 'M15 4 9 20'],
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
  // Adding is on the bar too, for a section whose edges are off the page.
  const more = doc.createElement('button');
  more.type = 'button';
  more.tabIndex = -1;
  more.setAttribute('data-cms-tool', 'addBelow');
  Object.assign(more.style, { display: 'grid', placeItems: 'center', width: '28px', height: '28px', padding: '0', border: '0', borderRadius: '6px', background: 'transparent', color: 'inherit', cursor: 'pointer' });
  more.append(drawing('add'));
  press(more, 'addAfter');
  bar.append(more);
  // Swatches: a look of the section chosen among a few of the site's colours has a dot for each
  // choice on the bar. The page changes nothing: it says which was pressed.
  const dots = doc.createElement('span');
  dots.setAttribute('data-cms-swatches', '');
  Object.assign(dots.style, { display: 'none', alignItems: 'center', gap: '7px', padding: '0 6px 0 10px', marginLeft: '4px', borderLeft: '1px solid color-mix(in srgb, currentColor 25%, transparent)' });
  bar.append(dots);
  // One bar for everything: what can be done to the thing the pointer was last on (a picture, a
  // link, an item of a list) is at its end, in the editor's orange, as the thing's own outline is.
  const forThing = doc.createElement('span');
  forThing.setAttribute('data-cms-about', '');
  Object.assign(forThing.style, { display: 'none', alignItems: 'center', gap: '4px', paddingLeft: '8px', marginLeft: '4px', borderLeft: '1px solid color-mix(in srgb, currentColor 25%, transparent)' });
  bar.append(forThing);
  // A colour and nothing else: a sample is never an address to fetch.
  const COLOUR = /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:oklch|oklab|rgb|hsl)\([0-9.%,/ -]+\))$/i;
  let dotted = '';
  const drawDots = (about: { readonly swatches?: unknown }, id: string): void => {
    const sets = Array.isArray(about.swatches) ? (about.swatches as { field?: unknown; name?: unknown; chosen?: unknown; choices?: unknown }[]) : [];
    const key = `${id}:${JSON.stringify(sets)}`;
    if (key === dotted) return;
    dotted = key;
    dots.replaceChildren();
    for (const set of sets) {
      if (typeof set.field !== 'string' || !Array.isArray(set.choices)) continue;
      for (const choice of set.choices as { value?: unknown; name?: unknown; colour?: unknown }[]) {
        if (typeof choice.value !== 'string' || typeof choice.colour !== 'string' || choice.colour.length > 64 || !COLOUR.test(choice.colour)) continue;
        const { field } = set;
        const { value } = choice;
        const dot = doc.createElement('button');
        dot.type = 'button';
        dot.tabIndex = -1;
        dot.setAttribute('data-cms-swatch', `${field}:${value}`);
        dot.title = [word(set.name), word(choice.name)].filter(Boolean).join(': ');
        const isChosen = set.chosen === value;
        if (isChosen) dot.setAttribute('data-cms-chosen', '');
        Object.assign(dot.style, {
          boxSizing: 'border-box',
          width: '18px',
          height: '18px',
          padding: '0',
          borderRadius: '50%',
          border: '1px solid color-mix(in srgb, currentColor 45%, transparent)',
          background: choice.colour,
          outline: isChosen ? `2px solid ${ACCENT}` : 'none',
          outlineOffset: '1px',
          cursor: isChosen ? 'default' : 'pointer',
        });
        dot.addEventListener('mousedown', (event) => event.preventDefault());
        dot.addEventListener('click', () => {
          if (!isChosen) say({ type: 'swatch', id, field, value });
        });
        dots.append(dot);
      }
    }
    dots.style.display = dots.childElementCount > 0 ? 'flex' : 'none';
  };
  const adder = (action: string, acts = true): HTMLButtonElement => {
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
    if (acts) press(button, action);
    else button.addEventListener('mousedown', (event) => event.preventDefault());
    layer.append(button);
    return button;
  };
  // A line along each edge of the section the bar is on, with the button that adds a section there.
  const seam = (): HTMLElement => {
    const drawn = doc.createElement('div');
    drawn.setAttribute('data-cms-seam', '');
    Object.assign(drawn.style, { position: 'absolute', display: 'none', height: '2px', marginTop: '-1px', background: ACCENT });
    layer.append(drawn);
    return drawn;
  };
  const seams = { addBefore: seam(), addAfter: seam() };
  const adders = { addBefore: adder('addBefore'), addAfter: adder('addAfter') };
  // An empty place inside a section (a column with nothing in it yet) has a button that adds the first.
  const slotOf = (element: HTMLElement): string => element.dataset['cmsSlot'] ?? '';
  const fillers = new Map<string, HTMLButtonElement>();
  const placeFillers = (isShown: boolean): void => {
    const wanted = new Map<string, DOMRect>();
    if (isShown && tools?.slots) {
      for (const slot of doc.querySelectorAll<HTMLElement>('[data-cms-slot]')) {
        const about = tools.slots[slotOf(slot)];
        const rect = slot.getBoundingClientRect();
        if (about?.empty === true && about.full !== true && rect.bottom > 14 && rect.top < page.innerHeight - 14 && rect.width > 0) wanted.set(slotOf(slot), rect);
      }
    }
    for (const [key, button] of fillers) {
      if (wanted.has(key)) continue;
      button.remove();
      fillers.delete(key);
    }
    for (const [key, rect] of wanted) {
      let button = fillers.get(key);
      if (!button) {
        button = adder('fill', false);
        button.setAttribute('data-cms-fill', key);
        button.addEventListener('click', () => {
          const at = key.indexOf(':');
          say({ type: 'slot', id: key.slice(0, at), field: key.slice(at + 1) });
        });
        fillers.set(key, button);
      }
      if (button.lastElementChild) button.lastElementChild.textContent = word(tools?.labels['add']);
      const middle = Math.min(Math.max(rect.top + rect.height / 2, 16), page.innerHeight - 16);
      Object.assign(button.style, { display: 'flex', top: `${middle}px`, left: `${rect.left + rect.width / 2}px` });
    }
  };
  layer.append(bar);
  const word = (value: unknown): string => (typeof value === 'string' ? value : '');
  // What the editor can change from the page has a button of its own on the bar once the pointer
  // has been on it: a picture, and a link or a button. The pointer may be on something the
  // template lays over it, so it is found by where it is.
  const chip = (name: string): HTMLButtonElement => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.tabIndex = -1;
    button.setAttribute('data-cms-tool', name);
    Object.assign(button.style, {
      display: 'none',
      alignItems: 'center',
      gap: '6px',
      height: '28px',
      padding: '0 10px 0 8px',
      border: '0',
      borderRadius: '6px',
      background: ACCENT,
      color: ACCENT_INK,
      font: `600 12px/1 ${FONT}`,
      whiteSpace: 'nowrap',
      cursor: 'pointer',
    });
    button.append(drawing(name), doc.createElement('span'));
    button.addEventListener('mousedown', (event) => event.preventDefault());
    forThing.append(button);
    return button;
  };
  let pictured: Mark | null = null;
  const pictureBox = outline('picture', '2px');
  const linkBox = outline('link', '2px');
  const changer = chip('picture');
  changer.addEventListener('click', () => {
    if (pictured?.field !== undefined) say({ type: 'picture', id: pictured.section, field: pictured.field });
  });
  let linked: Mark | null = null;
  const linker = chip('link');
  linker.addEventListener('click', () => {
    if (linked?.field !== undefined) say({ type: 'link', id: linked.section, field: linked.field });
  });
  // Of those that lie over one another, the smallest is the one meant.
  const smallestAt = (marks: readonly Mark[], x: number, y: number): Mark | null => {
    let found: Mark | null = null;
    let least = Infinity;
    for (const mark of marks) {
      const rect = mark.element.getBoundingClientRect();
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue;
      const size = rect.width * rect.height;
      if (size < least) [found, least] = [mark, size];
    }
    return found;
  };
  const pictureAt = (x: number, y: number): Mark | null => {
    const id = tooled?.dataset['cmsSection'] ?? '';
    const paths = tools?.sections[id]?.pictures;
    if (!tooled || !Array.isArray(paths)) return null;
    return smallestAt(
      paths.flatMap((path) => {
        const mark = typeof path === 'string' ? find(id, path) : null;
        return mark?.field === undefined ? [] : [mark];
      }),
      x,
      y,
    );
  };
  // A link shows no words of its own: it is found by where it leads. Two addresses that lead to
  // one place read the same here, whatever a preview added to one and however it ends.
  const leadsTo = (href: unknown): string | null => {
    if (typeof href !== 'string' || href === '') return null;
    try {
      const to = new URL(href, page.location.href);
      to.searchParams.delete('preview');
      return `${to.origin}${to.pathname.replace(/\/$/, '')}${to.search}${to.hash}`;
    } catch {
      return null;
    }
  };
  // Where the site found each link to an entry to lead, by `<type>:<entry>`: it says so beside this script.
  let leads: Record<string, unknown> | null = null;
  const linksIn = new WeakMap<Element, { readonly said: string; readonly found: Mark[] }>();
  const linksOf = (section: HTMLElement, id: string, paths: readonly unknown[]): readonly Mark[] => {
    const said = paths.join('\n');
    const known = linksIn.get(section);
    if (known?.said === said) return known.found;
    const found: Mark[] = [];
    linksIn.set(section, { said, found });
    const held = new Map<string, string>();
    try {
      if (leads === null) {
        const table: unknown = JSON.parse(doc.querySelector('script[data-cms-links]')?.textContent ?? '{}');
        leads = typeof table === 'object' && table !== null ? (table as Record<string, unknown>) : {};
      }
      const values: unknown = JSON.parse(section.dataset['cmsValues'] ?? '[]');
      for (const value of Array.isArray(values) ? values : []) {
        if (Array.isArray(value) && typeof value[0] === 'string' && typeof value[1] === 'string') held.set(value[0], value[1]);
      }
    } catch {
      return found;
    }
    // Fields that lead to the same place share the links that go there, in order.
    const wanted = new Map<string, string[]>();
    for (const path of paths) {
      if (typeof path !== 'string') continue;
      const entry = held.get(`${path}.kind`) === 'entry' ? `${held.get(`${path}.type`) ?? ''}:${held.get(`${path}.entry`) ?? ''}` : null;
      const to = leadsTo(entry === null ? (held.get(`${path}.href`) ?? held.get(path)) : leads?.[entry]);
      if (to !== null) wanted.set(to, [...(wanted.get(to) ?? []), path]);
    }
    const going = new Map<string, HTMLElement[]>();
    for (const anchor of within(section, 'a[href]')) {
      const to = leadsTo(anchor.getAttribute('href'));
      if (to !== null && wanted.has(to)) going.set(to, [...(going.get(to) ?? []), anchor]);
    }
    for (const [to, fields] of wanted) {
      const anchors = going.get(to) ?? [];
      anchors.forEach((element, at) => {
        const field = fields[Math.min(fields.length - 1, Math.floor((at * fields.length) / anchors.length))];
        if (field !== undefined) found.push({ element, section: id, field });
      });
    }
    return found;
  };
  const linkAt = (x: number, y: number): Mark | null => {
    const id = tooled?.dataset['cmsSection'] ?? '';
    const paths = tools?.sections[id]?.links;
    return tooled && Array.isArray(paths) ? smallestAt(linksOf(tooled, id, paths), x, y) : null;
  };
  // Words chosen in text being written have a bar of their own: bold, italic, link. The browser
  // shapes the words; where a link leads is asked of the editor, which has the words to ask with.
  const formatBar = doc.createElement('div');
  formatBar.setAttribute('data-cms-format', '');
  Object.assign(formatBar.style, {
    position: 'absolute',
    display: 'none',
    alignItems: 'center',
    gap: '2px',
    padding: '2px',
    borderRadius: '8px',
    background: 'CanvasText',
    color: 'Canvas',
    boxShadow: '0 4px 12px rgb(0 0 0 / 0.25)',
    pointerEvents: 'auto',
  });
  const chosenWords = (): Range | null => {
    const selection = page.getSelection();
    if (!writing || !selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
    const range = selection.getRangeAt(0);
    return writing.mark.element.contains(range.commonAncestorContainer) ? range : null;
  };
  const formatTool = (name: string, label: string, press: (now: Writing, range: Range) => void): HTMLButtonElement => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.tabIndex = -1;
    button.setAttribute('data-cms-format-tool', name);
    button.setAttribute('data-cms-label', label);
    Object.assign(button.style, { display: 'grid', placeItems: 'center', width: '28px', height: '28px', padding: '0', border: '0', borderRadius: '6px', background: 'transparent', color: 'inherit', cursor: 'pointer' });
    button.append(drawing(name));
    // The pointer going down must not take the chosen words away.
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      const range = chosenWords();
      if (writing && range) press(writing, range);
    });
    formatBar.append(button);
    return button;
  };
  const shape = (command: string, value?: string): void => {
    if (!writing) return;
    doc.execCommand(command, false, value);
    tellWriting(writing);
  };
  formatTool('bold', 'bold', () => shape('bold'));
  formatTool('italic', 'italic', () => shape('italic'));
  formatTool('link', 'textLink', (now, range) => {
    const start = isElement(range.startContainer) ? range.startContainer : range.startContainer.parentElement;
    const anchor = start?.closest('a[href]');
    asking = range.cloneRange();
    say({ type: 'linkAsk', id: now.mark.section, field: now.mark.field, href: anchor && now.mark.element.contains(anchor) ? withoutPreview(anchor.getAttribute('href') ?? '') : '' });
    placeFormat();
  });
  layer.append(formatBar);
  /** The editor's answer to where a link leads: an address, nothing to take the link away, or `null` to leave it. */
  const answerLink = (href: unknown): void => {
    const range = asking;
    asking = null;
    if (!writing || !range) return;
    writing.mark.element.focus();
    const selection = page.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    if (href === '') shape('unlink');
    else if (typeof href === 'string') shape('createLink', href);
    placeFormat();
  };
  placeFormat = (): void => {
    const range = asking ? null : chosenWords();
    if (!range) {
      formatBar.style.display = 'none';
      return;
    }
    for (const button of formatBar.querySelectorAll<HTMLButtonElement>('button')) button.title = word(tools?.labels[button.getAttribute('data-cms-label') ?? '']);
    const rect = typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : (writing?.mark.element.getBoundingClientRect() ?? null);
    if (!rect) return;
    // Above the chosen words, and under them where the page ends above.
    Object.assign(formatBar.style, { display: 'flex', top: `${rect.top >= 40 ? rect.top - 36 : rect.bottom + 6}px`, left: `${Math.max(rect.left, 4)}px` });
  };

  // One item of a list (a card, a row of a menu) has a small bar of its own: earlier, later, copy,
  // remove. An item is what holds everything found for its fields and nothing of another item's.
  interface Item extends Mark {
    readonly list: string;
    readonly at: number;
    readonly count: number;
    readonly full: boolean;
  }
  const itemsIn = new WeakMap<Element, { readonly said: string; readonly found: Item[] }>();
  const itemsOf = (section: HTMLElement, id: string): readonly Item[] => {
    const about = tools?.sections[id];
    const lists: readonly unknown[] = Array.isArray(about?.lists) ? about.lists : [];
    const links: readonly unknown[] = Array.isArray(about?.links) ? about.links : [];
    const said = JSON.stringify([lists, links]);
    const known = itemsIn.get(section);
    if (known?.said === said) return known.found;
    const found: Item[] = [];
    itemsIn.set(section, { said, found });
    // Every element known to show a field, by the field's place.
    const shown: [string, HTMLElement][] = [...guess(section)];
    for (const marked of within(section, '[data-cms-field]')) shown.push([marked.dataset['cmsField'] ?? '', marked]);
    for (const link of linksOf(section, id, links)) shown.push([link.field ?? '', link.element]);
    for (const list of lists) {
      if (typeof list !== 'object' || list === null) continue;
      const { field, count, full } = list as { readonly field?: unknown; readonly count?: unknown; readonly full?: unknown };
      if (typeof field !== 'string' || typeof count !== 'number') continue;
      const held = new Map<number, HTMLElement[]>();
      for (const [path, element] of shown) {
        if (!path.startsWith(`${field}.`)) continue;
        const at = Number(path.slice(field.length + 1).split('.')[0]);
        if (Number.isInteger(at) && at >= 0 && at < count) held.set(at, [...(held.get(at) ?? []), element]);
      }
      for (const [at, elements] of held) {
        let element = elements[0];
        if (!element) continue;
        while (element !== section && !elements.every((inner) => element?.contains(inner)) && element.parentElement) element = element.parentElement;
        // As far out as it goes without taking in another item, so the whole card is the item.
        const others = [...held].filter(([other]) => other !== at).flatMap(([, theirs]) => theirs);
        if (others.some((other) => element?.contains(other))) continue;
        while (others.length > 0 && element.parentElement && element.parentElement !== section && !others.some((other) => element?.parentElement?.contains(other))) element = element.parentElement;
        if (element !== section) found.push({ element, section: id, field: `${field}.${at}`, list: field, at, count, full: full === true });
      }
    }
    return found;
  };
  let itemed: Item | null = null;
  /** Where the item the bar is about will be on the page drawn next. */
  let next: number | undefined;
  /** What the bar was on when the page was last drawn: it is on it again, with no move of the pointer. */
  let again: { readonly id: string; readonly list?: string; readonly at?: number } | null = null;
  let forget = (): void => undefined;
  const itemAt = (x: number, y: number): Item | null => {
    const id = tooled?.dataset['cmsSection'] ?? '';
    if (!tooled || !tools) return null;
    const items = itemsOf(tooled, id);
    const mark = smallestAt(items, x, y);
    return items.find((item) => item.element === mark?.element && item.field === mark.field) ?? null;
  };
  const itemBox = outline('item', '2px');
  itemBox.style.borderStyle = 'dashed';
  const itemBar = doc.createElement('div');
  itemBar.setAttribute('data-cms-item-tools', '');
  Object.assign(itemBar.style, { display: 'none', alignItems: 'center', gap: '0', padding: '0 2px', height: '28px', boxSizing: 'border-box', borderRadius: '6px', background: ACCENT, color: ACCENT_INK });
  const itemTool = (action: string): HTMLButtonElement => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.tabIndex = -1;
    button.setAttribute('data-cms-item-tool', action);
    Object.assign(button.style, { display: 'grid', placeItems: 'center', width: '26px', height: '26px', padding: '0', border: '0', borderRadius: '6px', background: 'transparent', color: 'inherit', cursor: 'pointer' });
    button.append(drawing(action));
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => {
      if (!itemed || button.disabled) return;
      // Where the item will be once the page is drawn again, so the bar is still about it.
      next = action === 'remove' ? undefined : itemed.at + (action === 'up' ? -1 : action === 'down' ? 1 : 0);
      say({ type: 'item', id: itemed.section, field: itemed.list, at: itemed.at, action });
    });
    itemBar.append(button);
    return button;
  };
  const itemButtons = { up: itemTool('up'), down: itemTool('down'), duplicate: itemTool('duplicate'), remove: itemTool('remove') };
  forThing.append(itemBar);
  const placeItem = (): void => {
    const rect = shownRect(itemed);
    if (!rect || !tools || !itemed) {
      itemBar.style.display = 'none';
      itemBox.style.display = 'none';
      return;
    }
    place(itemBox, itemed);
    // Items side by side are moved sideways, and the arrows say so.
    const beside = itemsOf(tooled ?? itemed.element, itemed.section).find((other) => other.list === itemed?.list && other.at !== itemed.at);
    const sideways = beside !== undefined && Math.abs(beside.element.getBoundingClientRect().top - rect.top) < rect.height / 2;
    const able = { up: itemed.at > 0, down: itemed.at < itemed.count - 1, duplicate: !itemed.full, remove: true };
    for (const action of ['up', 'down', 'duplicate', 'remove'] as const) {
      const button = itemButtons[action];
      button.title = word(tools.labels[`item${action.charAt(0).toUpperCase()}${action.slice(1)}`]);
      button.disabled = !able[action];
      button.style.opacity = able[action] ? '1' : '0.4';
      button.style.cursor = able[action] ? 'pointer' : 'default';
      if (action === 'up' || action === 'down') (button.firstElementChild as SVGElement | null)?.style.setProperty('transform', sideways ? 'rotate(-90deg)' : 'none');
    }
    itemBar.style.display = 'flex';
  };
  const shownRect = (mark: Mark | null): DOMRect | null => {
    const rect = !typing && !writing && !drag?.moved && mark?.element.isConnected ? mark.element.getBoundingClientRect() : null;
    return !rect || !tools || rect.bottom <= 0 || rect.top >= page.innerHeight || (rect.width === 0 && rect.height === 0) ? null : rect;
  };
  const placeChips = (): void => {
    const picture = shownRect(pictured);
    changer.style.display = picture && tools ? 'flex' : 'none';
    if (picture && tools && changer.lastElementChild) changer.lastElementChild.textContent = word(tools.labels['picture']);
    place(pictureBox, picture ? pictured : null);
    const link = shownRect(linked);
    linker.style.display = link && tools ? 'flex' : 'none';
    if (link && tools && linker.lastElementChild) linker.lastElementChild.textContent = word(tools.labels['link']);
    place(linkBox, link ? linked : null);
    placeItem();
    forThing.style.display = changer.style.display === 'none' && linker.style.display === 'none' && itemBar.style.display === 'none' ? 'none' : 'flex';
    placeFormat();
  };
  // What the bar is about stays as it was while the pointer travels: over nothing, and across
  // other things on its way to the bar. It turns to another thing once the pointer rests on it.
  const REST = 140;
  let resting: number | undefined;
  const sameThing = (one: Mark | null, other: Mark | null): boolean => one?.element === other?.element && one?.field === other?.field;
  const pointed = (x: number, y: number, isNow: boolean): void => {
    page.clearTimeout(resting);
    resting = undefined;
    const picture = pictureAt(x, y);
    const link = linkAt(x, y);
    const item = itemAt(x, y);
    if (!picture && !link && !item) return;
    // Less of the same thing (the card, off its picture) is no reason to take a button away.
    if ((!picture || sameThing(picture, pictured)) && (!link || sameThing(link, linked)) && (!item || sameThing(item, itemed))) return;
    const turn = (): void => {
      resting = undefined;
      pictured = picture;
      linked = link;
      itemed = item;
      placeTools();
    };
    if (isNow || (!pictured && !linked && !itemed)) turn();
    else resting = page.setTimeout(turn, REST);
  };
  forget = (): void => {
    page.clearTimeout(resting);
    resting = undefined;
    pictured = null;
    linked = null;
    itemed = null;
  };
  doc.addEventListener(
    'mousemove',
    (event) => {
      // On the layer's own buttons, what they are for stays as it was.
      if (isElement(event.target) && layer.contains(event.target)) {
        page.clearTimeout(resting);
        resting = undefined;
        return;
      }
      pointed(event.clientX, event.clientY, false);
    },
    true,
  );
  placeTools = (): void => {
    placeChips();
    placeFillers(!typing && !writing && !drag?.moved);
    const hide = (): void => {
      bar.style.display = 'none';
      adders.addBefore.style.display = 'none';
      adders.addAfter.style.display = 'none';
      seams.addBefore.style.display = 'none';
      seams.addAfter.style.display = 'none';
    };
    // While words are typed, nothing sits over them.
    const section = typing || writing || drag?.moved ? null : tooled?.isConnected ? tooled : null;
    const about = section && tools?.sections[section.dataset['cmsSection'] ?? ''];
    if (!section || !tools || !about) return hide();
    const rect = section.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= page.innerHeight || (rect.width === 0 && rect.height === 0)) return hide();
    named.textContent = word(about.name);
    drawDots(about, section.dataset['cmsSection'] ?? '');
    const able: Record<keyof typeof buttons, boolean> = { up: about.up === true, down: about.down === true, duplicate: about.copy === true, remove: true };
    for (const action of ['up', 'down', 'duplicate', 'remove'] as const) {
      const button = buttons[action];
      button.title = word(tools.labels[action]);
      button.disabled = !able[action];
      button.style.opacity = able[action] ? '1' : '0.4';
      button.style.cursor = able[action] ? 'pointer' : 'default';
    }
    // At the section's top corner, and at the top of the page while the section's own top is above it.
    more.title = word(tools.labels['addAfter']);
    more.style.display = about.add === true ? 'grid' : 'none';
    Object.assign(bar.style, { display: 'flex', top: `${Math.min(Math.max(rect.top, 0) + 12, Math.max(rect.bottom - 44, 0))}px`, left: 'auto', right: `${Math.max(page.innerWidth - rect.right, 0) + 12}px` });
    // A bar wider than the room to its left (a narrow column) starts at the page's edge instead.
    if (bar.offsetWidth > 0 && bar.getBoundingClientRect().left < 4) Object.assign(bar.style, { left: '4px', right: 'auto' });
    for (const [action, edge] of [['addBefore', rect.top], ['addAfter', rect.bottom]] as const) {
      const button = adders[action];
      // An edge that is off the page, or a page that takes no more sections, has no button.
      const shown = about.add === true && edge >= 14 && edge <= page.innerHeight - 14;
      button.style.display = shown ? 'flex' : 'none';
      Object.assign(seams[action].style, { display: shown ? 'block' : 'none', top: `${edge}px`, left: `${rect.left}px`, width: `${rect.width}px` });
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
    x: number;
    y: number;
    /** The place inside a section it would land in, where that is not the place it is in. */
    into: string | undefined;
    /** The section it would land before, or `null` for after the last; `undefined` where it would not move. */
    before: string | null | undefined;
    moved: boolean;
  }
  let drag: Drag | null = null;
  const movable = (): HTMLElement[] => [...doc.querySelectorAll<HTMLElement>('[data-cms-section]')].filter((section) => tools?.sections[section.dataset['cmsSection'] ?? ''] !== undefined);
  const aim = (): void => {
    if (!drag) return;
    const { id, x, y } = drag;
    const all = movable();
    const listOf = (section: HTMLElement): string => word(tools?.sections[section.dataset['cmsSection'] ?? '']?.list);
    const home = word(tools?.sections[id]?.list);
    const group = word(tools?.sections[id]?.group);
    const dragged = all.find((section) => section.dataset['cmsSection'] === id);
    // It lands among the sections it is with, or in another place the pointer is over that takes
    // the same blocks: the smallest such place, and never one inside the section itself.
    let into = home;
    let place: DOMRect | undefined;
    for (const slot of doc.querySelectorAll<HTMLElement>('[data-cms-slot]')) {
      const about = tools?.slots?.[slotOf(slot)];
      if (!about || about.group !== group || dragged?.contains(slot) || (slotOf(slot) !== home && about.full === true)) continue;
      const rect = slot.getBoundingClientRect();
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue;
      if (place && place.width * place.height <= rect.width * rect.height) continue;
      into = slotOf(slot);
      place = rect;
    }
    const sections = all.filter((section) => listOf(section) === into);
    const at = sections.findIndex((section) => {
      const rect = section.getBoundingClientRect();
      return y < rect.top + rect.height / 2;
    });
    const target = at < 0 ? undefined : sections[at];
    const own = sections.findIndex((section) => section.dataset['cmsSection'] === id);
    const to = at < 0 ? sections.length : at;
    // Before itself, or before the one after it, is where it is already.
    const stays = into === home && (own < 0 || to === own || to === own + 1);
    drag.before = stays ? undefined : (target?.dataset['cmsSection'] ?? null);
    drag.into = into === home ? undefined : into;
    const last = sections[sections.length - 1];
    const beside = target?.getBoundingClientRect() ?? last?.getBoundingClientRect() ?? place;
    const edge = target ? target.getBoundingClientRect().top : (last?.getBoundingClientRect().bottom ?? (place ? place.top + 2 : 0));
    // Across the page for the page's own sections, and as wide as its neighbours inside a section.
    const across = into === '' || !beside ? { left: '0', right: '0', width: 'auto' } : { left: `${beside.left}px`, right: 'auto', width: `${beside.width}px` };
    Object.assign(line.style, { display: stays ? 'none' : 'block', top: `${Math.min(Math.max(edge, 2), page.innerHeight - 2)}px`, ...across });
  };
  const endDrag = (drop: boolean): void => {
    if (!drag) return;
    const { id, before, into, moved } = drag;
    drag = null;
    line.style.display = 'none';
    Object.assign(layer.style, { pointerEvents: 'none', cursor: '' });
    if (drop && moved && before !== undefined) say({ type: 'move', id, before, ...(into !== undefined && { into }) });
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
      drag = { id, from: event.clientY, x: event.clientX, y: event.clientY, into: undefined, before: undefined, moved: false };
      // The layer takes the pointer while it drags, so nothing on the page answers to it.
      Object.assign(layer.style, { pointerEvents: 'auto', cursor: 'grabbing' });
      page.setTimeout(creep, 16);
    });
  }
  doc.addEventListener(
    'mousemove',
    (event) => {
      if (!drag) return;
      drag.x = event.clientX;
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
    // Over what is no section (a header, a gap), the bar stays with the section it was on.
    const section = isElement(event.target) ? event.target.closest<HTMLElement>('[data-cms-section]') : null;
    if (section && section !== tooled) {
      tooled = section;
      forget();
    }
    draw();
  });
  doc.documentElement.addEventListener('mouseleave', () => {
    marks.over = null;
    tooled = null;
    forget();
    draw();
  });
  // Nothing on the page goes anywhere: a click chooses what it is on.
  doc.addEventListener(
    'click',
    (event) => {
      event.preventDefault();
      // A press on the layer's own bar is that button's business.
      if (isElement(event.target) && layer.contains(event.target)) return;
      // A press, or a tap where there is no pointer to rest, says at once what the bar is about.
      pointed(event.clientX, event.clientY, true);
      const mark = markOf(event.target);
      if (!mark) return;
      marks.chosen = mark;
      draw();
      // A field that is not being typed into here, where it is, is one for the form.
      const here = typing?.mark.element === mark.element || writing?.mark.element === mark.element;
      say({ type: 'section', id: mark.section, ...(mark.field !== undefined && { field: mark.field, ...(!here && { form: true }) }) });
    },
    true,
  );
  doc.addEventListener('submit', (event) => event.preventDefault(), true);

  // True once the page is where it should be: the person scrolled it, or the editor asked for a part of it.
  let settled = false;
  page.addEventListener('message', (event: MessageEvent<{ source?: unknown; type?: unknown; id?: unknown; field?: unknown } | null>) => {
    if (event.origin !== origin || event.source !== page.parent || event.data?.source !== SOURCE) return;
    if (event.data.type === 'typable') {
      const places = (event.data as { places?: unknown }).places;
      typable = typeof places === 'object' && places !== null ? (places as Record<string, unknown>) : {};
      return;
    }
    if (event.data.type === 'linkAnswer') {
      answerLink((event.data as { href?: unknown }).href);
      return;
    }
    if (event.data.type === 'tools') {
      const said = event.data as { labels?: unknown; sections?: unknown };
      const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
      const slots = (said as { slots?: unknown }).slots;
      tools = isRecord(said.labels) && isRecord(said.sections) ? { labels: said.labels, sections: said.sections as Tools['sections'], ...(isRecord(slots) && { slots: slots as NonNullable<Tools['slots']> }) } : null;
      if (again && tools && !tooled) {
        const was = again;
        tooled = [...doc.querySelectorAll<HTMLElement>('[data-cms-section]')].find((section) => section.dataset['cmsSection'] === was.id) ?? null;
        if (tooled && was.list !== undefined) itemed = itemsOf(tooled, was.id).find((item) => item.list === was.list && item.at === was.at) ?? null;
      }
      if (tools) again = null;
      draw();
      return;
    }
    if (event.data.type !== 'show' || typeof event.data.id !== 'string') return;
    // While words are typed into a section, the outline stays on the field they go into.
    if (typing?.mark.section === event.data.id || writing?.mark.section === event.data.id) return;
    const mark = find(event.data.id, typeof event.data.field === 'string' ? event.data.field : undefined);
    if (!mark) return;
    marks.chosen = mark;
    const rect = mark.element.getBoundingClientRect();
    // What is already in view stays where it is: the page does not jump while someone types. Nor
    // does a page drawn again, which is where the person left it: the editor says so (`still`).
    if ((event.data as { still?: unknown }).still !== true && (rect.bottom <= 0 || rect.top >= page.innerHeight)) {
      // Room for a header that stays at the top of the page.
      mark.element.style.scrollMarginTop = '6rem';
      settled = true;
      mark.element.scrollIntoView({ block: 'start' });
    }
    draw();
  });

  // Scroll.
  // A page drawn again is where it was: by the section that was in the window and where in it, so
  // it stays put even when something above is taller or shorter now, and else by how far down it was.
  const key = `velocity-cms:scroll:${page.location.pathname}`;
  try {
    let kept: { readonly y?: unknown; readonly id?: unknown; readonly top?: unknown; readonly on?: unknown; readonly list?: unknown; readonly at?: unknown } = {};
    try {
      const read: unknown = JSON.parse(page.sessionStorage.getItem(key) ?? 'null');
      kept = typeof read === 'number' ? { y: read } : typeof read === 'object' && read !== null ? read : {};
    } catch {
      // What was kept another way is as good as nothing kept.
    }
    if (kept.on === true && typeof kept.id === 'string') again = { id: kept.id, ...(typeof kept.list === 'string' && typeof kept.at === 'number' && { list: kept.list, at: kept.at }) };
    const back = (): void => {
      if (typeof kept.y !== 'number' || !(kept.y > 0)) return;
      const section = [...doc.querySelectorAll<HTMLElement>('[data-cms-section]')].find((candidate) => candidate.dataset['cmsSection'] === kept.id);
      const to = section && typeof kept.top === 'number' ? page.scrollY + section.getBoundingClientRect().top - kept.top : kept.y;
      if (Math.abs(page.scrollY - to) > 1) page.scrollTo({ top: Math.max(to, 0), behavior: 'instant' });
    };
    back();
    // A page that is not as tall yet as it will be (photos, fonts) is put back again as it settles,
    // until the person scrolls it or the editor asks for another part of it.
    for (const sign of ['wheel', 'touchmove', 'keydown', 'mousedown']) page.addEventListener(sign, () => (settled = true), { once: true, capture: true, passive: true });
    let tries = 0;
    const settle = (): void => {
      if (settled) return;
      back();
      if (++tries < 20) page.setTimeout(settle, 100);
    };
    page.setTimeout(settle, 100);
    page.addEventListener('load', () => {
      if (!settled) back();
    });
    page.addEventListener('pagehide', () => {
      // The section being worked on, or else the first one in the window.
      const inView = (section: HTMLElement | null | undefined): section is HTMLElement => {
        const rect = section?.isConnected ? section.getBoundingClientRect() : null;
        return rect !== null && rect.bottom > 0 && rect.top < page.innerHeight;
      };
      const section = inView(tooled) ? tooled : [...doc.querySelectorAll<HTMLElement>('[data-cms-section]')].find(inView);
      const item = section === tooled && itemed ? { list: itemed.list, at: next ?? itemed.at } : undefined;
      page.sessionStorage.setItem(key, JSON.stringify({ y: page.scrollY, ...(section && { id: section.dataset['cmsSection'], top: section.getBoundingClientRect().top, on: section === tooled, ...item }) }));
    });
  } catch {
    // A page that may not keep anything starts at the top.
  }
  // The page is drawn again in place: a template's fade from one page to the next is for visitors.
  // The turn itself is kept, since it holds the page as it was on screen until this one is ready,
  // and is made to take no time. The rule is the bridge's own sheet, not a change to the page's.
  try {
    const sheet = new page.CSSStyleSheet();
    sheet.replaceSync('::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none !important; }');
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  } catch {
    // A browser without such sheets shows the template's own turn.
  }

  say({ type: 'ready' });
}

/** The bridge as the page is sent it. */
export const PREVIEW_BRIDGE_SCRIPT = `(${previewBridge.toString()})(window);\n`;
