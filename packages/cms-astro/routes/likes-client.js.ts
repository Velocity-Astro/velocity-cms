import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * What a page with a like button or share buttons runs (`/cms-likes.js`). A template draws the
 * buttons as it likes and marks them:
 *
 * - `<button data-cms-like data-cms-like-type="posts" data-cms-like-entry="…" aria-pressed="false">`:
 *   a like button. Pressed, it likes the entry and pressed again takes the like back. It gains
 *   `aria-pressed` and `data-cms-liked` to style by, and `data-cms-like-state="sending"` while a
 *   like is on its way. `siteLikes(Astro)` gives the type and the entry.
 * - `[data-cms-like-count]`: where the count is written, inside the button or anywhere with the
 *   same `data-cms-like-type` and `data-cms-like-entry` (a card in a list). Draw it `hidden`: it
 *   is shown once there is a count, and stays hidden when the type does not show counts.
 * - `[data-cms-like-status]`: where a word for screen readers is written after a press, usually a
 *   `role="status"`; `data-cms-like-liked` and `data-cms-like-unliked` on the button hold the words.
 * - `<button data-cms-share="native">`: opens the device's own share sheet. Draw it `hidden`:
 *   it is shown only where the browser has one.
 * - `<button data-cms-share="copy" data-cms-share-url="…">`: copies the address. It gains
 *   `data-cms-share-state="copied"` for two seconds, and its `data-cms-share-copied` words are
 *   written into `[data-cms-share-status]`.
 *
 * A like is kept against a random id this browser keeps, made the first time a like is pressed
 * and sent only then; the site keeps only a hash of it. Nothing is asked of a visitor who never
 * presses, beyond the counts.
 */
const SCRIPT = `
const ENDPOINT = '/api/cms/likes';
const KEPT = 'velocity-cms:likes';
const BROWSER = 'velocity-cms:browser';

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // A browser that keeps nothing still likes: it is told on each press.
  }
}

function liked() {
  try {
    const kept = JSON.parse(read(KEPT) || '[]');
    return new Set(Array.isArray(kept) ? kept.filter((one) => typeof one === 'string') : []);
  } catch {
    return new Set();
  }
}
function keep(key, isLiked) {
  const all = liked();
  if (isLiked) all.add(key);
  else all.delete(key);
  write(KEPT, JSON.stringify([...all].slice(-500)));
}

function browser() {
  let id = read(BROWSER);
  if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
    id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + String(Date.now())).replace(/[^A-Za-z0-9_-]/g, '');
    write(BROWSER, id);
  }
  return id;
}

const keyOf = (element) => element.dataset.cmsLikeType + '/' + element.dataset.cmsLikeEntry;
const marked = () => [...document.querySelectorAll('[data-cms-like-type][data-cms-like-entry]')];
const number = (value) => new Intl.NumberFormat(document.documentElement.lang || undefined).format(value);

function showCount(key, count) {
  for (const element of marked()) {
    if (keyOf(element) !== key) continue;
    element.dataset.cmsLikeCounted = String(count);
    const places = element.matches('[data-cms-like-count]') ? [element] : [...element.querySelectorAll('[data-cms-like-count]')];
    for (const place of places) {
      place.textContent = number(count);
      place.hidden = false;
    }
  }
}

function showLiked(key, isLiked) {
  for (const button of marked()) {
    if (keyOf(button) !== key || !button.matches('[data-cms-like]')) continue;
    button.setAttribute('aria-pressed', String(isLiked));
    button.dataset.cmsLiked = String(isLiked);
  }
}

/** Asks how many likes every entry on the page has, one request for each type. */
async function counts() {
  const byType = new Map();
  for (const element of marked()) {
    const entries = byType.get(element.dataset.cmsLikeType) ?? new Set();
    entries.add(element.dataset.cmsLikeEntry);
    byType.set(element.dataset.cmsLikeType, entries);
  }
  for (const [type, entries] of byType) {
    const all = [...entries];
    for (let start = 0; start < all.length; start += 100) {
      try {
        const response = await fetch(ENDPOINT + '?type=' + encodeURIComponent(type) + '&entries=' + all.slice(start, start + 100).map(encodeURIComponent).join(','), { headers: { accept: 'application/json' } });
        const answer = await response.json().catch(() => null);
        for (const [entry, count] of Object.entries(answer?.counts ?? {})) if (typeof count === 'number') showCount(type + '/' + entry, count);
      } catch {
        // Without the counts the buttons still work.
      }
    }
  }
}

function say(button, words) {
  const place = button.querySelector('[data-cms-like-status]') ?? document.querySelector('[data-cms-like-status]');
  if (place && words) place.textContent = words;
}

async function press(button) {
  if (button.dataset.cmsLikeState === 'sending') return;
  const key = keyOf(button);
  const was = button.getAttribute('aria-pressed') === 'true';
  const before = Number(button.dataset.cmsLikeCounted);
  const now = !was;
  // Shown at once, and put right by the site's answer.
  showLiked(key, now);
  if (!Number.isNaN(before)) showCount(key, Math.max(0, before + (now ? 1 : -1)));
  button.dataset.cmsLikeState = 'sending';
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ type: button.dataset.cmsLikeType, entry: button.dataset.cmsLikeEntry, browser: browser(), liked: now }),
    });
    const answer = await response.json().catch(() => null);
    if (!response.ok || typeof answer?.liked !== 'boolean') throw new Error('refused');
    showLiked(key, answer.liked);
    keep(key, answer.liked);
    if (typeof answer.count === 'number') showCount(key, answer.count);
    say(button, answer.liked ? button.dataset.cmsLikeLiked : button.dataset.cmsLikeUnliked);
  } catch {
    showLiked(key, was);
    if (!Number.isNaN(before)) showCount(key, before);
  } finally {
    delete button.dataset.cmsLikeState;
  }
}

function share(button) {
  const url = button.dataset.cmsShareUrl || location.href.split('#')[0];
  if (button.dataset.cmsShare === 'native') {
    navigator.share?.({ title: button.dataset.cmsShareTitle || document.title, url }).catch(() => undefined);
    return;
  }
  if (button.dataset.cmsShare === 'copy') {
    const copied = () => {
      button.dataset.cmsShareState = 'copied';
      const place = button.querySelector('[data-cms-share-status]') ?? document.querySelector('[data-cms-share-status]');
      if (place && button.dataset.cmsShareCopied) place.textContent = button.dataset.cmsShareCopied;
      setTimeout(() => {
        delete button.dataset.cmsShareState;
        if (place) place.textContent = '';
      }, 2000);
    };
    navigator.clipboard?.writeText(url).then(copied, () => undefined);
  }
}

function start() {
  const kept = liked();
  for (const button of document.querySelectorAll('[data-cms-like]')) {
    if (button.dataset.cmsLikeReady) continue;
    button.dataset.cmsLikeReady = 'true';
    if (kept.has(keyOf(button))) showLiked(keyOf(button), true);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      void press(button);
    });
  }
  for (const button of document.querySelectorAll('[data-cms-share]')) {
    if (button.dataset.cmsShareReady) continue;
    button.dataset.cmsShareReady = 'true';
    // A share sheet only where the device has one; elsewhere the other buttons do.
    if (button.dataset.cmsShare === 'native') button.hidden = typeof navigator.share !== 'function';
    if (button.dataset.cmsShare === 'copy' && !navigator.clipboard) button.hidden = true;
    button.addEventListener('click', () => share(button));
  }
  void counts();
}

start();
document.addEventListener('astro:after-swap', start);
`;

export const GET: APIRoute = () =>
  new Response(SCRIPT, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
