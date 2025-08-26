// Utilities for robust timezone detection and display in mobile PWAs (iOS/Android)
// Uses Intl when available, falls back to numeric UTC offset label when needed.

// Try to map the current UTC offset (in minutes east of UTC) to a representative IANA timezone.
// Note: This is heuristic and only covers common zones to avoid saving plain 'UTC' on iOS PWA when Intl reports 'UTC'.
export function mapOffsetToIana(totalMinutesEast: number): string | null {
  // Positive values are east of UTC
  const m = totalMinutesEast;
  switch (m) {
    case 330: return 'Asia/Kolkata'; // IST
    case 240: return 'Asia/Dubai';   // GST
    case 480: return 'Asia/Singapore'; // SGT
    case 0:   return 'Europe/London';  // GMT/BST (approx)
    case 60:
    case 120:
      return 'Europe/Berlin'; // CET/CEST (approx)
    case -300:
    case -240:
      return 'America/New_York'; // EST/EDT
    case -480:
    case -420:
      return 'America/Los_Angeles'; // PST/PDT
    default:
      return null;
  }
}

export function getReliableTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && tz.toUpperCase() !== 'UTC') return tz;
  } catch {}

  // If Intl reported 'UTC', try to infer a common IANA from the current offset.
  const offsetMin = new Date().getTimezoneOffset(); // minutes to add to local to get UTC
  const total = -offsetMin; // positive east of UTC
  const inferred = mapOffsetToIana(total);
  if (inferred) return inferred;

  // Fallback to numeric offset like "UTC+05:30" or "UTC-04:00"
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
