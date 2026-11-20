/**
 * The page's side of the editor: what a page of the site runs when it is shown beside the
 * editor's form. It is kept with the editor, whose other half of the conversation it is, and
 * imports nothing, so the site can send it to a browser as it is.
 */
export { PREVIEW_BRIDGE_SCRIPT, previewBridge } from './preview-bridge.js';
