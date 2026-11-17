/** The part of the day a greeting is for. */
export type DayPart = 'morning' | 'afternoon' | 'evening';

/** Morning until noon, afternoon until six, evening after: by the person's own clock. */
export function dayPart(now: Date = new Date()): DayPart {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}
