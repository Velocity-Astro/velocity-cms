import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * What a page with a form of the CMS runs, so the form is sent without leaving the page. Without
 * it (or without scripts at all) the form still posts, and the site answers with a page.
 *
 * A template marks its form and the places for words:
 *
 * - `<form data-cms-form>`: the form. `data-cms-form-failed` holds what to say when the site
 *   cannot be reached. It gains `data-cms-form-state` (`sending`, `sent` or `failed`) to style by.
 * - `[data-cms-form-status]`: where the answer is written, usually a `role="status"`.
 * - `[data-cms-form-error="<field key>"]`: where a problem with that field is written.
 * - a submit button may carry `data-cms-form-sending`, its words while the form is on its way.
 *   They replace the button's words, or those of the `[data-cms-form-label]` inside it.
 *
 * Every word is written as text. Nothing the visitor typed comes back from the site.
 */
const SCRIPT = `
const fieldsOf = (form, key) => [...form.elements].filter((element) => element.name === key);
const errorOf = (form, key) => [...form.querySelectorAll('[data-cms-form-error]')].find((place) => place.dataset.cmsFormError === key);

function clear(form, key) {
  const place = errorOf(form, key);
  if (place) {
    place.textContent = '';
    place.hidden = true;
  }
  for (const field of fieldsOf(form, key)) field.removeAttribute('aria-invalid');
}

function say(form, state, message) {
  form.dataset.cmsFormState = state;
  const status = form.querySelector('[data-cms-form-status]');
  if (status) {
    status.textContent = message;
    status.hidden = message === '';
  }
}

async function send(form) {
  const button = form.querySelector('[type="submit"]');
  const words = button?.querySelector('[data-cms-form-label]') ?? button;
  const label = words?.textContent ?? '';
  for (const place of form.querySelectorAll('[data-cms-form-error]')) clear(form, place.dataset.cmsFormError);
  say(form, 'sending', '');
  if (button) {
    button.disabled = true;
    if (button.dataset.cmsFormSending) words.textContent = button.dataset.cmsFormSending;
  }
  try {
    const response = await fetch(form.action, { method: 'POST', headers: { accept: 'application/json' }, body: new URLSearchParams(new FormData(form)) });
    const answer = await response.json().catch(() => null);
    if (response.ok && answer?.ok) {
      form.reset();
      say(form, 'sent', String(answer.message ?? ''));
      return;
    }
    const issues = Array.isArray(answer?.error?.issues) ? answer.error.issues : [];
    let first = null;
    for (const issue of issues) {
      const key = String(issue?.path?.[0] ?? '');
      const place = errorOf(form, key);
      if (!place) continue;
      place.textContent = String(issue.message ?? '');
      place.hidden = false;
      for (const field of fieldsOf(form, key)) {
        field.setAttribute('aria-invalid', 'true');
        first ??= field;
      }
    }
    say(form, 'failed', String(answer?.error?.message ?? form.dataset.cmsFormFailed ?? ''));
    first?.focus();
  } catch {
    say(form, 'failed', form.dataset.cmsFormFailed ?? '');
  } finally {
    if (button) {
      button.disabled = false;
      words.textContent = label;
    }
  }
}

function start() {
  for (const form of document.querySelectorAll('form[data-cms-form]')) {
    if (form.dataset.cmsFormReady) continue;
    form.dataset.cmsFormReady = 'true';
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (form.dataset.cmsFormState !== 'sending') void send(form);
    });
    // A problem is taken away as soon as its field is touched again.
    form.addEventListener('input', (event) => {
      if (event.target?.name) clear(form, event.target.name);
    });
  }
}

start();
document.addEventListener('astro:after-swap', start);
`;

export const GET: APIRoute = () =>
  new Response(SCRIPT, { headers: { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
