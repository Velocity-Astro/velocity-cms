const STEPS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
];

/** A time as people say it: "2 hours ago", "yesterday", "now". */
export function relativeTime(timestamp: string, locale: string, now: Date = new Date()): string {
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const difference = new Date(timestamp).getTime() - now.getTime();
  for (const [unit, size] of STEPS) {
    if (Math.abs(difference) >= size) return format.format(Math.round(difference / size), unit);
  }
  return format.format(0, 'second');
}
