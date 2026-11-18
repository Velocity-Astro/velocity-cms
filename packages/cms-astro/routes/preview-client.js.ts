import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * What the page beside the editor's form runs. The preview adds it to that page only, and it
 * does nothing unless the page is in a frame of the same site.
 *
 * It tells the editor which section was clicked, shows the section the editor asks for, and
 * keeps the page where it was scrolled to when it is drawn again. It marks a section by setting
 * its style from script, which a page's content rules allow where a style written into the page
 * would not be.
 */
const SCRIPT = `
if (window.parent !== window) {
  const origin = location.origin;
  const say = (message) => window.parent.postMessage({ source: 'velocity-cms', ...message }, origin);
  const sectionOf = (target) => (target instanceof Element ? target.closest('[data-cms-section]') : null);

  let marked = null;
  const mark = (section) => {
    if (marked === section) return;
    if (marked) marked.style.outline = marked.style.outlineOffset = marked.style.cursor = '';
    marked = section;
    if (!section) return;
    section.style.outline = '2px solid Highlight';
    section.style.outlineOffset = '-2px';
    section.style.cursor = 'pointer';
  };
  document.addEventListener('mouseover', (event) => mark(sectionOf(event.target)));
  document.documentElement.addEventListener('mouseleave', () => mark(null));

  // Nothing on the page goes anywhere: a click chooses the section it is in.
  document.addEventListener('click', (event) => {
    event.preventDefault();
    const section = sectionOf(event.target);
    if (section) say({ type: 'section', id: section.dataset.cmsSection });
  }, true);
  document.addEventListener('submit', (event) => event.preventDefault(), true);

  addEventListener('message', (event) => {
    if (event.origin !== origin || event.source !== window.parent || event.data?.source !== 'velocity-cms') return;
    if (event.data.type !== 'show') return;
    const section = [...document.querySelectorAll('[data-cms-section]')].find((candidate) => candidate.dataset.cmsSection === event.data.id);
    if (!section) return;
    // Room for a header that stays at the top of the page.
    section.style.scrollMarginTop = '6rem';
    section.scrollIntoView({ block: 'start' });
  });

  const key = 'velocity-cms:scroll:' + location.pathname;
  try {
    const kept = Number(sessionStorage.getItem(key));
    if (kept > 0) scrollTo({ top: kept, behavior: 'instant' });
    addEventListener('pagehide', () => sessionStorage.setItem(key, String(scrollY)));
  } catch {}

  say({ type: 'ready' });
}
`;

export const GET: APIRoute = () =>
  new Response(SCRIPT, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
