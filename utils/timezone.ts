// Utilities for robust timezone detection and display in mobile PWAs (iOS/Android)
// Uses Intl when available, falls back to numeric UTC offset label when needed.

export function getReliableTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz.toUpperCase() !== 'UTC') return tz;
  } catch {}

  // Fallback to numeric offset like "UTC+05:30" or "UTC-04:00"
  const offsetMin = new Date().getTimezoneOffset(); // minutes to add to local to get UTC
  const total = -offsetMin; // positive east of UTC
  const sign = total >= 0 ? '+' : '-';
  const abs = Math.abs(total);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${hh}:${mm}`;
}

export function getUtcOffsetLabel(date: Date = new Date()): string {
  const offsetMin = date.getTimezoneOffset();
  const total = -offsetMin;
  const sign = total >= 0 ? '+' : '-';
  const abs = Math.abs(total);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${hh}:${mm}`;
}

export function deviceLocalPreview(): { tz: string; offset: string; sample: string } {
  const tz = getReliableTimeZone();
  let sample = '';
  try {
    sample = new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    sample = new Date().toString();
  }
  return { tz, offset: getUtcOffsetLabel(), sample };
}
