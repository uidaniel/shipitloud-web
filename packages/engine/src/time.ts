// Local times in the founder's timezone, for scheduling ("9:00 on Tuesday where they live").

function offsetMs(ts: number, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ts));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Math.floor(ts / 1000) * 1000;
}

export function validTimeZone(tz: string | null | undefined): string {
  try { if (tz) { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } } catch { /* fall through */ }
  return 'UTC';
}

/** The UTC instant for a wall-clock time in a timezone. */
export function zonedTime(ymd: { y: number; m: number; d: number }, hour: number, minute: number, tz: string): Date {
  const zone = validTimeZone(tz);
  const guess = Date.UTC(ymd.y, ymd.m - 1, ymd.d, hour, minute);
  // Two passes settle the offset correctly around daylight-saving changes.
  const first = guess - offsetMs(guess, zone);
  return new Date(guess - offsetMs(first, zone));
}

/** The calendar date in a timezone, as numbers. */
export function localDate(at: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: validTimeZone(tz), year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(at);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { y: Number(g('year')), m: Number(g('month')), d: Number(g('day')), weekday: g('weekday') };
}

/** The next `n` weekdays (Mon-Fri) after today in the founder's timezone. */
export function nextWeekdays(n: number, tz: string, from = new Date()): { y: number; m: number; d: number }[] {
  const out: { y: number; m: number; d: number }[] = [];
  const today = localDate(from, tz);
  let cursor = Date.UTC(today.y, today.m - 1, today.d);
  while (out.length < n) {
    cursor += 86_400_000;
    const day = new Date(cursor).getUTCDay();
    if (day !== 0 && day !== 6) { const c = new Date(cursor); out.push({ y: c.getUTCFullYear(), m: c.getUTCMonth() + 1, d: c.getUTCDate() }); }
  }
  return out;
}
