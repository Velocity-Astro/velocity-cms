/**
 * Hands the person a file made in the editor, such as an export. The browser saves it under
 * `name`; nothing is sent anywhere.
 */
export function downloadText(name: string, text: string, type: string): void {
  const address = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = address;
  link.download = name;
  link.click();
  URL.revokeObjectURL(address);
}
