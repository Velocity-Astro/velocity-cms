import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { expectAccessible } from '../../testing/accessible.js';
import { PagePreview, type PagePreviewProps } from './PagePreview.js';

const example = (props: Partial<PagePreviewProps> = {}) => (
  <PagePreview label="The page, as it would look" address="/why-list-with-us/?preview=abc" draft='{"id":"p1","data":{}}' emptyText="Save the page once to see it here." {...props} />
);

let submit: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const frame = () => screen.getByTitle<HTMLIFrameElement>('The page, as it would look');
/** What the page in the frame says to the editor. */
const say = (data: unknown, from: { origin?: string; source?: MessageEventSource | null } = {}) =>
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, origin: from.origin ?? window.location.origin, source: from.source === undefined ? frame().contentWindow : from.source }));
  });

it('asks the site for the page at once, sending what is in the form into the frame', () => {
  render(example());
  expect(submit).toHaveBeenCalledOnce();
  const form = document.querySelector('form');
  expect(form?.getAttribute('action')).toBe('/why-list-with-us/?preview=abc');
  expect(form?.method).toBe('post');
  expect(form?.target).toBe(frame().name);
  expect(form?.querySelector<HTMLInputElement>('input[name="draft"]')?.value).toBe('{"id":"p1","data":{}}');
});

it('keeps its form out of a form it is shown in, since a form may not hold another', () => {
  render(<form aria-label="The screen's own">{example()}</form>);
  expect(screen.getByRole('form', { name: "The screen's own" }).querySelector('form')).toBeNull();
  expect(document.querySelector('form[method="post"]')?.parentElement).toBe(document.body);
});

it('draws the page again once the typing pauses, not on every key', () => {
  vi.useFakeTimers();
  const { rerender } = render(example());
  rerender(example({ draft: 'a' }));
  rerender(example({ draft: 'ab' }));
  act(() => void vi.advanceTimersByTime(400));
  expect(submit).toHaveBeenCalledTimes(1);
  act(() => void vi.advanceTimersByTime(200));
  expect(submit).toHaveBeenCalledTimes(2);
});

it('says which section was pressed on the page', () => {
  const onSectionPress = vi.fn();
  render(example({ onSectionPress }));
  say({ source: 'velocity-cms', type: 'section', id: 's2' });
  expect(onSectionPress).toHaveBeenCalledWith('s2');
});

it('says which field of the section was pressed, where the page marks its fields', () => {
  const onSectionPress = vi.fn();
  render(example({ onSectionPress }));
  say({ source: 'velocity-cms', type: 'section', id: 's2', field: 'items.0.text' });
  expect(onSectionPress).toHaveBeenCalledWith('s2', 'items.0.text', false);
  say({ source: 'velocity-cms', type: 'section', id: 's2', field: 'items.0.text', form: true });
  expect(onSectionPress).toHaveBeenLastCalledWith('s2', 'items.0.text', true);
  say({ source: 'velocity-cms', type: 'section', id: 's2', field: 7 });
  expect(onSectionPress).toHaveBeenLastCalledWith('s2');
});

it('listens to nothing but this site\'s own page in this frame', () => {
  const onSectionPress = vi.fn();
  render(example({ onSectionPress }));
  say({ source: 'velocity-cms', type: 'section', id: 's2' }, { origin: 'https://elsewhere.example' });
  say({ source: 'velocity-cms', type: 'section', id: 's2' }, { source: window });
  say({ source: 'something-else', type: 'section', id: 's2' });
  say({ source: 'velocity-cms', type: 'section', id: 7 });
  say(null);
  expect(onSectionPress).not.toHaveBeenCalled();
});

it('asks the page to show a section, when it is chosen and when the page has been drawn again', () => {
  const { rerender } = render(example());
  const post = vi.spyOn(frame().contentWindow as Window, 'postMessage').mockImplementation(() => undefined);
  rerender(example({ shownSectionId: 's3' }));
  expect(post).toHaveBeenLastCalledWith({ source: 'velocity-cms', type: 'show', id: 's3' }, window.location.origin);
  say({ source: 'velocity-cms', type: 'ready' });
  expect(post).toHaveBeenCalledTimes(2);
});

it('leaves a page drawn again where the person left it, unless the change that drew it asked for a section', () => {
  vi.useFakeTimers();
  const { rerender } = render(example({ shownSectionId: 's1' }));
  const post = vi.spyOn(frame().contentWindow as Window, 'postMessage').mockImplementation(() => undefined);
  const shows = () => post.mock.calls.map(([message]) => message as { type: string; id?: string; still?: boolean }).filter((message) => message.type === 'show');
  // The first page brings the section into view.
  say({ source: 'velocity-cms', type: 'ready' });
  expect(shows().at(-1)).toEqual({ source: 'velocity-cms', type: 'show', id: 's1' });
  // Much later something else on the page changes (a swatch far down it): the page stays put.
  vi.advanceTimersByTime(5000);
  rerender(example({ shownSectionId: 's1', draft: '{"id":"p1","data":{"tone":"invert"}}' }));
  vi.advanceTimersByTime(1000);
  say({ source: 'velocity-cms', type: 'ready' });
  expect(shows().at(-1)).toEqual({ source: 'velocity-cms', type: 'show', id: 's1', still: true });
  // A section moved or added is asked for with the change itself, and is brought into view.
  rerender(example({ shownSectionId: 's4', draft: '{"id":"p1","data":{"moved":true}}' }));
  vi.advanceTimersByTime(1000);
  say({ source: 'velocity-cms', type: 'ready' });
  expect(shows().at(-1)).toEqual({ source: 'velocity-cms', type: 'show', id: 's4' });
  // And the next change is quiet again.
  rerender(example({ shownSectionId: 's4', draft: '{"id":"p1","data":{}}' }));
  vi.advanceTimersByTime(1000);
  say({ source: 'velocity-cms', type: 'ready' });
  expect(shows().at(-1)).toEqual({ source: 'velocity-cms', type: 'show', id: 's4', still: true });
});

it('says what is typed on the page, and does not draw the page again for it', () => {
  vi.useFakeTimers();
  const onWords = vi.fn();
  const { rerender } = render(example({ onWords }));
  say({ source: 'velocity-cms', type: 'words', id: 's1', field: 'title', words: 'Typed here' });
  expect(onWords).toHaveBeenCalledWith('s1', 'title', 'Typed here');
  // The form now holds those words: the page has them already.
  rerender(example({ onWords, draft: 'typed on the page' }));
  act(() => void vi.advanceTimersByTime(800));
  expect(submit).toHaveBeenCalledTimes(1);
  // A change made in the form is drawn as before.
  rerender(example({ onWords, draft: 'typed in the form' }));
  act(() => void vi.advanceTimersByTime(600));
  expect(submit).toHaveBeenCalledTimes(2);

  say({ source: 'velocity-cms', type: 'words', id: 's1', field: 'title', words: 7 });
  say({ source: 'velocity-cms', type: 'words', id: 's1', words: 'No field' });
  expect(onWords).toHaveBeenCalledTimes(1);
});

it('still draws a change made in the form that the page lacks, when words are typed on the page before the pause is over', () => {
  vi.useFakeTimers();
  const { rerender } = render(example());
  rerender(example({ draft: 'typed in the form' }));
  act(() => void vi.advanceTimersByTime(200));
  say({ source: 'velocity-cms', type: 'words', id: 's1', field: 'title', words: 'Typed here' });
  rerender(example({ draft: 'both' }));
  act(() => void vi.advanceTimersByTime(600));
  expect(submit).toHaveBeenCalledTimes(2);
});

it('tells the page where words may be typed, when it is drawn and when that changes', () => {
  const { rerender } = render(example({ typable: { s1: ['title'] } }));
  const post = vi.spyOn(frame().contentWindow as Window, 'postMessage').mockImplementation(() => undefined);
  say({ source: 'velocity-cms', type: 'ready' });
  expect(post).toHaveBeenCalledWith({ source: 'velocity-cms', type: 'typable', places: { s1: ['title'] } }, window.location.origin);
  rerender(example({ typable: { s1: ['title'] } }));
  expect(post).toHaveBeenCalledTimes(1);
  rerender(example({ typable: { s1: ['title', 'items.0.text'] } }));
  expect(post).toHaveBeenLastCalledWith({ source: 'velocity-cms', type: 'typable', places: { s1: ['title', 'items.0.text'] } }, window.location.origin);
});

it('says so when there is no page yet, and asks for nothing', () => {
  render(example({ address: undefined }));
  expect(screen.getByText('Save the page once to see it here.')).toBeTruthy();
  expect(screen.queryByTitle('The page, as it would look')).toBeNull();
  expect(submit).not.toHaveBeenCalled();
});

it('shows its one action at the start of the bar, in place of the note', () => {
  render(example({ note: 'A note', action: <button type="button">Open larger</button> }));
  expect(screen.getByRole('button', { name: 'Open larger' })).toBeTruthy();
  expect(screen.queryByText('A note')).toBeNull();
});

it('has no accessibility violations', async () => {
  const { container } = render(example({ note: 'Shows the form as it is now.' }));
  await expectAccessible(container);
});

it('says when the keys for undo or redo were pressed on the page, and draws what the form then holds', () => {
  vi.useFakeTimers();
  const onUndo = vi.fn();
  const onRedo = vi.fn();
  const { rerender } = render(example({ onUndo, onRedo }));
  // Words were typed on the page a moment ago, and the step back takes them away again.
  say({ source: 'velocity-cms', type: 'words', id: 's1', field: 'title', words: 'Typed here' });
  rerender(example({ onUndo, onRedo, draft: 'typed on the page' }));
  say({ source: 'velocity-cms', type: 'undo' });
  expect(onUndo).toHaveBeenCalledTimes(1);
  rerender(example({ onUndo, onRedo, draft: 'as it was' }));
  act(() => void vi.advanceTimersByTime(600));
  expect(submit).toHaveBeenCalledTimes(2);
  say({ source: 'velocity-cms', type: 'redo' });
  expect(onRedo).toHaveBeenCalledTimes(1);
});

it('says which swatch of a section was pressed on the page', () => {
  const onSectionSwatch = vi.fn();
  render(example({ onSectionSwatch }));
  say({ source: 'velocity-cms', type: 'swatch', id: 's1', field: 'tone', value: 'secondary' });
  say({ source: 'velocity-cms', type: 'swatch', id: 's1', field: 'tone' });
  expect(onSectionSwatch.mock.calls).toEqual([['s1', 'tone', 'secondary']]);
});
