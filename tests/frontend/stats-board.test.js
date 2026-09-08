import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compactStatsContext,
  fallbackChart,
  normalizeChart,
  parseStatsInsight,
  withChartFallback,
} from '../../src/js/stats-board.js';

const ctx = compactStatsContext({
  dash: {
    total_patients: 2,
    total_treatments: 2,
    new_patients_by_month: [{ ym: '2026-08', count: 1 }, { ym: '2026-09', count: 1 }],
  },
  groups: { en_tratamiento: [{}], completado: [], en_pausa: [{}], abandonado: [] },
  demo: {
    gender: [{ label: 'Femenino', count: 2 }],
    age_ranges: [{ label: '30–44', count: 2 }],
    source: [{ label: 'Derivación', count: 1 }, { label: 'Espontánea', count: 1 }],
  },
});

test('el contexto de estadísticas no incluye nombres ni direcciones', () => {
  assert.equal(ctx.pacientes, 2);
  assert.equal(ctx.estados.en_tratamiento, 1);
  assert.equal(ctx.estados.en_pausa, 1);
  assert.ok(!JSON.stringify(ctx).includes('address'));
});

test('parsea JSON de la IA y cae a texto si viene prosa', () => {
  const parsed = parseStatsInsight(
    '```json\n{"title":"Por género","insight":"Los dos casos son femeninos.","chart":{"type":"pie","labels":["Femenino"],"values":[2]}}\n```',
  );
  assert.equal(parsed.title, 'Por género');
  assert.equal(parsed.chart.type, 'pie');
  const prose = parseStatsInsight('No hay datos suficientes para un gráfico.');
  assert.equal(prose.chart, null);
  assert.match(prose.insight, /datos suficientes/);
});

test('si la IA no grafica y la pregunta se puede cuantificar, se arma el gráfico', () => {
  const insight = withChartFallback(
    { title: 'Género', insight: 'Hay dos pacientes.', chart: null },
    '¿Los tratamientos completados cambian según género?',
    ctx,
  );
  assert.ok(insight.chart);
  assert.equal(insight.chart.type, 'stat');
  assert.equal(insight.chart.value, 2);
  assert.ok(fallbackChart('fuente de derivación', ctx));
});

test('normalizeChart descarta series vacías', () => {
  assert.equal(normalizeChart({ type: 'bar', labels: ['a'], values: [] }), null);
  assert.deepEqual(normalizeChart({ type: 'stat', value: 4, label: 'Pacientes' }), {
    type: 'stat',
    label: 'Pacientes',
    value: 4,
  });
});
