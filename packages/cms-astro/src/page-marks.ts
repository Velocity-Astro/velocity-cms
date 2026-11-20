import { isEditorPreview } from './preview.js';

/** Attributes a template spreads on an element of a page. Nothing at all, except beside the editor's form. */
export type PageMark = Readonly<Record<string, string>>;

const NONE: PageMark = Object.freeze({});

/** How deep a section's values are looked into for words, which is deeper than a list in a list goes. */
const DEPTH = 6;

/** What a section holds that a page can show, each with its place: `['items.0.text', 'Open daily']`. */
function shown(data: unknown, path: readonly (string | number)[], into: (readonly string[])[]): void {
  if (typeof data === 'string') {
    if (data.trim() !== '' && path.length > 0) into.push([path.join('.'), data]);
    return;
  }
  if (typeof data !== 'object' || data === null || path.length >= DEPTH) return;
  if (Array.isArray(data)) {
    data.forEach((item, at) => shown(item, [...path, at], into));
    return;
  }
  // A section inside this one (a column's) says what it holds on its own mark.
  const inner = data as { id?: unknown; block?: unknown; data?: unknown };
  if (typeof inner.id === 'string' && typeof inner.block === 'string' && typeof inner.data === 'object' && inner.data !== null) return;
  const html: unknown = (data as { html?: unknown }).html;
  // Text shaped in the editor is one field, found by its words and not its markup.
  if (typeof html === 'string' && path.length > 0) {
    if (html.trim() !== '') into.push([path.join('.'), html, 'html']);
    return;
  }
  for (const [key, value] of Object.entries(data)) shown(value, [...path, key], into);
}

/**
 * Says which section of a page an element is, for the page beside the editor's form: a click on
 * it there finds the section in the form. A template spreads it on the element that wraps the
 * section:
 *
 * ```astro
 * <div {...sectionMark(section.id, section.data)}><Block {...section.data} /></div>
 * ```
 *
 * Given what the section holds, the mark also says which words belong to which field
 * (`data-cms-values`), and the page beside the form finds each field by the words it shows, so a
 * click on a heading opens the heading's field with no mark on the heading. Where that is not
 * enough (a value the block changes before it shows it), the block says so with `fieldMark`.
 *
 * A visitor's page gets no attribute, so nothing about the editor reaches the site.
 */
export function sectionMark(id: string, data?: unknown): PageMark {
  if (!isEditorPreview()) return NONE;
  const values: (readonly string[])[] = [];
  if (data !== undefined) shown(data, [], values);
  return values.length > 0 ? { 'data-cms-section': id, 'data-cms-values': JSON.stringify(values) } : { 'data-cms-section': id };
}

/**
 * Says which place inside a section an element is: one that holds sections of its own, such as a
 * column of a row. Given the section's id and where the place is in it, as `fieldMark` is:
 *
 * ```astro
 * {columns.map((column, at) => (
 *   <div {...slotMark(section.id, 'columns', at, 'content')}>
 *     {column.content.map((inner) => <div {...sectionMark(inner.id, inner.data)}>…</div>)}
 *   </div>
 * ))}
 * ```
 *
 * Beside the editor's form, an empty place then has a button that adds its first section, and a
 * section can be dragged from one place to another. A visitor's page gets no attribute.
 */
export function slotMark(sectionId: string, ...path: readonly (string | number)[]): PageMark {
  return path.length > 0 && isEditorPreview() ? { 'data-cms-slot': `${sectionId}:${path.join('.')}` } : NONE;
}

/**
 * Says which field of its section an element shows, by the field's key, so a click on it beside
 * the editor's form opens that field and not only the section:
 *
 * ```astro
 * <h1 {...fieldMark('title')}>{title}</h1>
 * {items.map((item, at) => <li {...fieldMark('items', at, 'text')}>{item.text}</li>)}
 * ```
 *
 * The parts are joined with dots: a field inside a list is the list's key, the item's place and
 * the field's own key. A mark written this way comes before what `sectionMark` finds by itself, and
 * a field with no mark is still edited in the form.
 */
export function fieldMark(...path: readonly (string | number)[]): PageMark {
  return path.length > 0 && isEditorPreview() ? { 'data-cms-field': path.join('.') } : NONE;
}
