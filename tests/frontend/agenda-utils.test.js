import assert from 'node:assert/strict';
import test from 'node:test';

import {
  opaqueCode,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  addMonths,
  isSameDay,
  toLocalISO,
  parseLocalISO,
  toDateISO,
  parseDateISO,
  formatCLP,
  monthGrid,
  overlaps,
} from '../../src/js/agenda-utils.js';

test('opaqueCode pads treatment id', () => {
  assert.equal(opaqueCode(42), 'TL-0042');
  assert.equal(opaqueCode(1), 'TL-0001');
});

test('startOfWeek is Monday (Chile)', () => {
  const wed = new Date(2026, 6, 29);
  const mon = startOfWeek(wed);
  assert.equal(mon.getDay(), 1);
  assert.equal(mon.getDate(), 27);
  assert.equal(mon.getMonth(), 6);
});

test('endOfWeek is Sunday', () => {
  const wed = new Date(2026, 6, 29);
  const sun = endOfWeek(wed);
  assert.equal(sun.getDay(), 0);
  assert.equal(sun.getDate(), 2);
  assert.equal(sun.getMonth(), 7);
});

test('addMonths crosses year boundary', () => {
  const d = new Date(2026, 11, 15);
  const next = addMonths(d, 1);
  assert.equal(next.getFullYear(), 2027);
  assert.equal(next.getMonth(), 0);
});

test('monthGrid has 6 rows of 7 cells (42 total)', () => {
  const grid = monthGrid(new Date(2026, 6, 1));
  assert.equal(grid.length, 6);
  assert.equal(grid.flat().length, 42);
  const inMonth = grid.flat().filter((c) => c.inMonth);
  assert.equal(inMonth.length, 31);
});

test('toLocalISO and parseLocalISO round-trip without day shift', () => {
  const d = new Date(2026, 6, 31, 14, 30);
  const iso = toLocalISO(d);
  assert.equal(iso, '2026-07-31T14:30');
  const back = parseLocalISO(iso);
  assert.ok(isSameDay(d, back));
  assert.equal(back.getHours(), 14);
  assert.equal(back.getMinutes(), 30);
});

test('toDateISO and parseDateISO round-trip', () => {
  const d = new Date(2026, 0, 5);
  const iso = toDateISO(d);
  assert.equal(iso, '2026-01-05');
  const back = parseDateISO(iso);
  assert.ok(isSameDay(d, back));
});

test('formatCLP uses Chilean peso without decimals', () => {
  const formatted = formatCLP(45000);
  assert.match(formatted, /45\.?000/);
  assert.match(formatted, /\$/);
});

test('overlaps detects conflicting sessions', () => {
  const a = { scheduled_at: '2026-07-31T10:00', duration_min: 50 };
  const b = { scheduled_at: '2026-07-31T10:30', duration_min: 50 };
  const c = { scheduled_at: '2026-07-31T12:00', duration_min: 50 };
  assert.equal(overlaps(a, b), true);
  assert.equal(overlaps(a, c), false);
});

test('startOfMonth and endOfMonth', () => {
  const d = new Date(2026, 6, 15);
  const s = startOfMonth(d);
  const e = endOfMonth(d);
  assert.equal(s.getDate(), 1);
  assert.equal(e.getDate(), 31);
  assert.equal(e.getMonth(), 6);
});

test('addDays', () => {
  const d = new Date(2026, 6, 31);
  const next = addDays(d, 1);
  assert.equal(next.getMonth(), 7);
  assert.equal(next.getDate(), 1);
});
