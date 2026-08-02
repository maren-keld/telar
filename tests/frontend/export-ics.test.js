import assert from 'node:assert/strict';
import test from 'node:test';

import { buildIcs, escapeIcsText, foldIcsLine } from '../../src/js/export-ics.js';

const SAMPLE_SESSION = {
  id: 99,
  treatment_id: 42,
  scheduled_at: '2026-07-31T10:00',
  duration_min: 50,
  attendance: 'pendiente',
  patient_name: 'Juanita Testverificacion',
};

test('buildIcs produces balanced VCALENDAR and VEVENT', () => {
  const ics = buildIcs([SAMPLE_SESSION]);
  const beginCal = (ics.match(/BEGIN:VCALENDAR/g) || []).length;
  const endCal = (ics.match(/END:VCALENDAR/g) || []).length;
  const beginEvt = (ics.match(/BEGIN:VEVENT/g) || []).length;
  const endEvt = (ics.match(/END:VEVENT/g) || []).length;
  assert.equal(beginCal, 1);
  assert.equal(endCal, 1);
  assert.equal(beginEvt, 1);
  assert.equal(endEvt, 1);
});

test('buildIcs has stable UID', () => {
  const ics = buildIcs([SAMPLE_SESSION]);
  assert.match(ics, /UID:telar-session-99@telarapp\.cl/);
});

test('buildIcs uses CRLF line endings', () => {
  const ics = buildIcs([SAMPLE_SESSION]);
  assert.ok(ics.includes('\r\n'));
  assert.ok(!ics.includes('\n') || ics.includes('\r\n'));
});

test('buildIcs escapes special characters', () => {
  const text = escapeIcsText('a,b;c\\d');
  assert.equal(text, 'a\\,b\\;c\\\\d');
});

test('foldIcsLine folds lines to max 75 octets', () => {
  const long = 'SUMMARY:' + 'A'.repeat(100);
  const folded = foldIcsLine(long);
  const lines = folded.split('\r\n');
  const encoder = new TextEncoder();
  for (const line of lines) {
    assert.ok(encoder.encode(line).length <= 75, `line too long: ${encoder.encode(line).length}`);
  }
});

test('buildIcs NEVER contains patient name (anonymous default)', () => {
  const ics = buildIcs([SAMPLE_SESSION], { anonymous: true });
  assert.ok(!ics.includes('Juanita'));
  assert.ok(!ics.includes('Testverificacion'));
  assert.ok(ics.includes('TL-0042'));
  assert.ok(ics.includes('SUMMARY:Telar'));
});

test('cancelled session gets STATUS:CANCELLED', () => {
  const ics = buildIcs([{ ...SAMPLE_SESSION, attendance: 'cancelada' }]);
  assert.match(ics, /STATUS:CANCELLED/);
});

test('buildIcs includes VALARM reminder', () => {
  const ics = buildIcs([SAMPLE_SESSION]);
  assert.match(ics, /BEGIN:VALARM/);
  assert.match(ics, /TRIGGER:-PT1H/);
});

test('buildIcs includes required calendar headers', () => {
  const ics = buildIcs([SAMPLE_SESSION]);
  assert.match(ics, /PRODID:-\/\/Telar\/\/Agenda\/\/ES/);
  assert.match(ics, /CALSCALE:GREGORIAN/);
  assert.match(ics, /METHOD:PUBLISH/);
});
