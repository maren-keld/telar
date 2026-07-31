import assert from 'node:assert/strict';
import test from 'node:test';

import { parseAnalyzeOutput, renderResults } from '../../src/js/modules/nf-results.js';

test('parseAnalyzeOutput maps analyzer values and structured extras', () => {
  const extra = {
    post: [{ t: 1, calm: 62, att: 38 }],
    spectral: { theta_beta_fp2: 1.4, alpha_asym_fp: -2, artifact_pct: 8 },
  };

  const result = parseAnalyzeOutput(`45,30,0.7,0.4,61,64.5,35.5,50,40,14.5,-4.5\n${JSON.stringify(extra)}`);

  assert.deepEqual(result, {
    calm_seconds: 45,
    attention_seconds: 30,
    calm_level: 0.7,
    attention_level: 0.4,
    relaxation_pct: 61,
    calm_pct: 64.5,
    attentive_pct: 35.5,
    baseline_calm_pct: 50,
    baseline_attentive_pct: 40,
    delta_calm_pct: 14.5,
    delta_attentive_pct: -4.5,
    post_series: extra.post,
    spectral: extra.spectral,
  });
});

test('parseAnalyzeOutput pads legacy output and tolerates malformed extras', () => {
  const result = parseAnalyzeOutput('10,20,0.5\nnot-json');

  assert.equal(result.calm_seconds, 10);
  assert.equal(result.attention_seconds, 20);
  assert.equal(result.delta_attentive_pct, 0);
  assert.deepEqual(result.post_series, []);
  assert.deepEqual(result.spectral, {});
});

test('renderResults shows live chart and explain cards without legacy toggles', () => {
  const liveTrace = [
    { t: 0, pct: 50, phase: 'training' },
    { t: 1000, pct: 60, phase: 'training' },
    { t: 2000, pct: 55, phase: 'training' },
  ];
  const html = renderResults(
    {
      calm_seconds: 65,
      attention_seconds: 9,
      calm_pct: 54.56,
      attentive_pct: 45.44,
      post_series: [],
      spectral: {},
    },
    {
      protocol: 'relajacion',
      device: '<Muse>',
      locations: ['TP9', 'AF7'],
      duration_sec: 74,
      baseline_skipped: false,
    },
    '<script>alert(1)</script>',
    true,
    liveTrace,
  );

  assert.match(html, /nf-live-chart/);
  assert.match(html, /Protocolo: Calma/);
  assert.match(html, /¿Qué significan calma y atención\?/);
  assert.match(html, /atención mide foco/);
  assert.match(html, /Métrica entrenada hoy/);
  assert.match(html, /Solo referencia/);
  assert.match(html, /Selección y mantenimiento/);
  assert.match(html, /La mente se mantiene tranquila/);
  assert.doesNotMatch(html, /Promedio durante la grabación/);
  assert.doesNotMatch(html, /Sesión en vivo/);
  assert.doesNotMatch(html, /Evolución en el tratamiento/);
  assert.match(html, /<span>Duración de sesión<\/span><span>01:14<\/span>/);
  assert.match(html, /&lt;Muse&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /id="nf-export-csv"/);
});

test('renderResults returns the empty-session state without DOM globals', () => {
  assert.match(renderResults(null), /Graba una sesión/);
});
