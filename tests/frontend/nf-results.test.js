import assert from 'node:assert/strict';
import test from 'node:test';

import { parseAnalyzeOutput, renderResults } from '../../src/js/modules/nf-results.js';

test('parseAnalyzeOutput maps analyzer values and structured extras', () => {
  const extra = {
    post: [{ t: 1, calm: 62, att: 38 }],
    spectral: {
      theta_beta_fp2: 1.4,
      alpha_asym_fp: -2,
      artifact_pct: 8,
      has_baseline: true,
      packets_lost: 3,
      packets_expected: 80,
      fs_hz: 252.1,
      effective_fs: 252.1,
    },
  };

  const result = parseAnalyzeOutput(`45,30,0,0,61,64.5,35.5,50,40,14.5,-4.5\n${JSON.stringify(extra)}`);

  assert.equal(result.calm_seconds, 45);
  assert.equal(result.attention_seconds, 30);
  assert.equal(result.relaxation_pct, 61);
  assert.equal(result.calm_pct, 64.5);
  assert.equal(result.attentive_pct, 35.5);
  assert.equal(result.baseline_calm_pct, 50);
  assert.equal(result.baseline_attentive_pct, 40);
  assert.equal(result.delta_calm_pct, 14.5);
  assert.equal(result.delta_attentive_pct, -4.5);
  assert.equal(result.has_baseline, true);
  assert.deepEqual(result.post_series, extra.post);
  assert.equal(result.spectral.packets_lost, 3);
  assert.equal('calm_level' in result, false);
  assert.equal('attention_level' in result, false);
});

test('parseAnalyzeOutput pads legacy output and does not fake deltas without baseline', () => {
  const result = parseAnalyzeOutput('10,20,0.5\nnot-json');

  assert.equal(result.calm_seconds, 10);
  assert.equal(result.attention_seconds, 20);
  assert.equal(result.delta_attentive_pct, null);
  assert.equal(result.has_baseline, false);
  assert.deepEqual(result.post_series, []);
  assert.deepEqual(result.spectral, {});
});

test('renderResults shows live chart, disclaimer, packets/fs, and no 0/1/2 levels', () => {
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
      has_baseline: true,
      delta_calm_pct: 8.2,
      delta_attentive_pct: -3,
      post_series: [],
      spectral: {
        packets_lost: 4,
        packets_expected: 120,
        fs_hz: 251.4,
        effective_fs: 251.4,
        fs_off_nominal: true,
      },
    },
    {
      protocol: 'relajacion',
      device: '<Muse>',
      locations: ['TP9', 'AF7'],
      duration_sec: 74,
      baseline_skipped: false,
      packets_lost: 4,
      packets_expected: 120,
      effective_fs: 251.4,
    },
    '<script>alert(1)</script>',
    true,
    liveTrace,
  );

  assert.match(html, /nf-live-chart/);
  assert.match(html, /Protocolo: Calma/);
  assert.match(html, /no es dispositivo médico/);
  assert.match(html, /Paquetes perdidos/);
  assert.match(html, /Frecuencia de muestreo efectiva/);
  assert.match(html, /251\.4/);
  assert.doesNotMatch(html, /nivel\s*[012]/i);
  assert.doesNotMatch(html, /calm_level|att_level|Nivel 0|Nivel 1|Nivel 2/);
  assert.match(html, /¿Qué significan calma y atención\?/);
  assert.match(html, /Ojos abiertos/);
  assert.match(html, /beta estrecha/);
  assert.match(html, /Métrica entrenada hoy/);
  assert.match(html, /Solo referencia/);
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
