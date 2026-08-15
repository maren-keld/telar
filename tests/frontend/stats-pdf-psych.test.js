import assert from 'node:assert/strict';
import test from 'node:test';

import { buildScoreChartSeries } from '../../src/js/psychometric-summary.js';
import { newPatientsModel, breakdownModel, isEmptyBreakdown } from '../../src/js/reportes-charts.js';

function gadSessions() {
  return [
    {
      number: 1,
      modules: [
        { module_type: 'gad7', data: JSON.stringify({ answers: [3, 3, 2, 3, 2, 2, 3] }) },
        { module_type: 'neurofeedback', data: JSON.stringify({ last_results: { calm_pct: 80 } }) },
      ],
    },
    {
      number: 4,
      modules: [{ module_type: 'gad7', data: JSON.stringify({ answers: [1, 1, 0, 1, 1, 0, 1] }) }],
    },
  ];
}

test('score series includes GAD-7 curve and skips neurofeedback', () => {
  const series = buildScoreChartSeries(gadSessions());
  const gad = series.find((s) => s.type === 'gad7' || /gad/i.test(s.title || ''));
  assert.ok(gad, 'debería incluir GAD-7');
  assert.equal(gad.points.length, 2);
  assert.equal(gad.points[0].value, 18);
  assert.equal(gad.points[1].value, 5);
  assert.ok(!series.some((s) => /neuro/i.test(s.title)));
});

test('new patients chart model stays compact and totals the year', () => {
  const model = newPatientsModel([
    { ym: '2025-09', count: 0 },
    { ym: '2026-07', count: 1 },
    { ym: '2026-08', count: 4 },
  ]);
  assert.equal(model.total, 5);
  assert.equal(model.delta, 3);
  assert.equal(model.bars[0].label, 'Sep');
  assert.equal(model.bars[2].pct, 100);
  assert.ok(Math.abs(model.mean - 5 / 3) < 1e-9);
  assert.ok(model.meanPct > 0);
});

test('demographic breakdown uses percentages for the segmented bar', () => {
  assert.equal(isEmptyBreakdown([{ label: 'Sin dato', count: 0 }]), true);
  const model = breakdownModel([
    { label: '18-25', count: 4 },
    { label: '26-35', count: 1 },
  ]);
  assert.equal(model.total, 5);
  assert.equal(model.rows[0].pct, 80);
});
