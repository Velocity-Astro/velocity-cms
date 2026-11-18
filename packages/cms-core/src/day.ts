/** Whether the text is a real day written as `2026-03-14`, in this century or later. */
export function isDay(text: string): boolean {
  if (!/^[2-9]\d{3}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}
