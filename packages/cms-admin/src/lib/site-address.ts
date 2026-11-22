/** The address the editor is served from, which is the site's own: where its MCP server and API are. */
export function siteAddress(): string {
  return typeof window === 'undefined' ? '' : window.location.origin;
}
