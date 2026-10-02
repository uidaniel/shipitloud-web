import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDate, nextWeekdays, validTimeZone, zonedTime } from './time.ts';

test('wall-clock times convert to the right UTC instant', () => {
  assert.equal(zonedTime({ y: 2026, m: 10, d: 6 }, 9, 0, 'Africa/Lagos').toISOString(), '2026-10-06T08:00:00.000Z');
  assert.equal(zonedTime({ y: 2026, m: 10, d: 6 }, 9, 0, 'UTC').toISOString(), '2026-10-06T09:00:00.000Z');
  // New York: summer (UTC-4) and winter (UTC-5)
  assert.equal(zonedTime({ y: 2026, m: 7, d: 1 }, 9, 0, 'America/New_York').toISOString(), '2026-07-01T13:00:00.000Z');
  assert.equal(zonedTime({ y: 2026, m: 12, d: 1 }, 9, 0, 'America/New_York').toISOString(), '2026-12-01T14:00:00.000Z');
  // London across the October change (BST ends Oct 25, 2026)
  assert.equal(zonedTime({ y: 2026, m: 10, d: 23 }, 9, 0, 'Europe/London').toISOString(), '2026-10-23T08:00:00.000Z');
  assert.equal(zonedTime({ y: 2026, m: 10, d: 26 }, 9, 0, 'Europe/London').toISOString(), '2026-10-26T09:00:00.000Z');
});

test('bad timezones fall back to UTC', () => {
  assert.equal(validTimeZone('Mars/Olympus'), 'UTC');
  assert.equal(validTimeZone(null), 'UTC');
});

test('next weekdays skip weekends and start tomorrow in local time', () => {
  // Friday 2 Oct 2026, 23:30 UTC is already Saturday in Lagos.
  const from = new Date('2026-10-02T23:30:00Z');
  assert.equal(localDate(from, 'Africa/Lagos').weekday, 'Sat');
  assert.deepEqual(nextWeekdays(5, 'Africa/Lagos', from).map((x) => x.d), [5, 6, 7, 8, 9]);
  assert.deepEqual(nextWeekdays(2, 'UTC', from).map((x) => x.d), [5, 6]);
});
