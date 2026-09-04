import assert from 'node:assert/strict';
import test from 'node:test';

import { formatShareAnsweredAt, formatShareArrivalMessage, shareAnsweredAt } from '../../src/js/share-notify.js';

test('el toast nombra sesión, módulo y paciente', () => {
  const text = formatShareArrivalMessage({
    sessionNumber: 3,
    moduleLabel: 'GAD-7 — Ansiedad generalizada',
    patientName: 'Ana Pérez',
  });
  assert.match(text, /sesión 3/);
  assert.match(text, /GAD-7/);
  assert.match(text, /Ana Pérez/);
});

test('sin nombre usa «tu paciente»', () => {
  const text = formatShareArrivalMessage({
    sessionNumber: 1,
    moduleLabel: 'DASS-21',
  });
  assert.match(text, /tu paciente/);
});

test('shareAnsweredAt lee la fecha guardada en el módulo', () => {
  assert.equal(shareAnsweredAt({ share_answered_at: '2026-10-02T16:05:00.000Z' }), '2026-10-02T16:05:00.000Z');
  assert.equal(shareAnsweredAt({}), null);
  assert.equal(shareAnsweredAt('{"share_answered_at":"2026-10-02T16:05:00.000Z"}'), '2026-10-02T16:05:00.000Z');
});

test('formatShareAnsweredAt formatea en español', () => {
  const label = formatShareAnsweredAt('2026-10-02T19:05:00.000Z');
  assert.ok(label);
  assert.match(label, /2/);
});
