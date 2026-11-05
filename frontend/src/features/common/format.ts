// Display helpers. The API sends UTC timestamps with microseconds, which not every browser parses.

const MICROSECONDS = /(\.\d{3})\d+Z$/;

export function parseTimestamp(iso: string): Date | null {
  const date = new Date(iso.replace(MICROSECONDS, '$1Z'));
  return Number.isNaN(date.getTime()) ? null : date;
}

const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return '';
  const date = parseTimestamp(iso);
  return date ? dateTimeFormat.format(date) : '';
}

const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

const RELATIVE_STEPS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

/** "3 hours ago", "yesterday". Falls back to the absolute time for anything older than a month. */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const date = parseTimestamp(iso);
  if (!date) return '';
  const seconds = (date.getTime() - now.getTime()) / 1000;
  if (Math.abs(seconds) >= 30 * 86_400) return formatDateTime(iso);
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(seconds) >= size) return relativeFormat.format(Math.round(seconds / size), unit);
  }
  return relativeFormat.format(Math.round(seconds), 'second');
}

/** Average first response. "45 min", "1 h 15 min", "2 days 3 h". */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours} h ${rest} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  const dayText = `${days} ${days === 1 ? 'day' : 'days'}`;
  return restHours ? `${dayText} ${restHours} h` : dayText;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
