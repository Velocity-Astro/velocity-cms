import { isEditorPreview } from './preview.js';

/** Attributes a template spreads on an element of a page. Nothing at all, except beside the editor's form. */
export type PageMark = Readonly<Record<string, string>>;

const NONE: PageMark = Object.freeze({});

/**
 * Says which section of a page an element is, for the page beside the editor's form: a click on
 * it there finds the section in the form. A template spreads it on the element that wraps the
 * section:
 *
 * ```astro
 * <div {...sectionMark(section.id)}><Block {...section.data} /></div>
 * ```
 *
 * A visitor's page gets no attribute, so nothing about the editor reaches the site.
 */
export function sectionMark(id: string): PageMark {
  return isEditorPreview() ? { 'data-cms-section': id } : NONE;
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
 * the field's own key. A field with no mark is still edited in the form.
 */
export function fieldMark(...path: readonly (string | number)[]): PageMark {
  return path.length > 0 && isEditorPreview() ? { 'data-cms-field': path.join('.') } : NONE;
}
