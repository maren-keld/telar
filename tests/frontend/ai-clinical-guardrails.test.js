import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAiGuardrailsContext,
  buildAiSystemPrompt,
  parseAiActions,
  sanitizePlan,
} from '../../src/js/ai-actions.js';
import {
  detectRecentRiskSignals,
  filterModuleIdsForCatalog,
  isAdultOnlyModule,
  normalizeModuleId,
  patientAgeFromBirth,
} from '../../src/js/ai-clinical-guardrails.js';

test('patientAgeFromBirth calcula edad desde nacimiento', () => {
  const birth = new Date();
  birth.setFullYear(birth.getFullYear() - 13);
  const iso = birth.toISOString().slice(0, 10);
  assert.equal(patientAgeFromBirth(iso), 13);
});

test('normalizeModuleId mapea alias sig_autoconceptos', () => {
  assert.equal(normalizeModuleId('sig_autoconceptos'), 'tcc_autoconceptos');
});

test('detectRecentRiskSignals detecta hospitalización reciente', () => {
  const text =
    'Paciente de 13 años. Hospitalización en mayo 2026 por ideación suicida y autolesión.';
  assert.equal(detectRecentRiskSignals(text), true);
});

test('filterModuleIdsForCatalog excluye escalas adultas si <18', () => {
  const ids = ['gad7', 'dass21', 'asrs', 'pcl5', 'ades'];
  const filtered = filterModuleIdsForCatalog(ids, 13);
  assert.ok(!filtered.includes('asrs'));
  assert.ok(!filtered.includes('pcl5'));
  assert.ok(!filtered.includes('gad7'));
  assert.ok(filtered.includes('dass21'));
  assert.ok(filtered.includes('ades'));
});

test('sanitizePlan retira ASRS/PCL-5 para paciente 13 años (caso Renata)', () => {
  const raw = {
    label: 'Plan 12 sesiones',
    sessions: [
      { label: 'Evaluación', modules: ['asrs', 'pcl5', 'registro_inicial'] },
      { label: 'Exposición trauma', modules: ['tcc_exposicion', 'sprint_ecl'] },
      { label: 'Seguimiento', modules: ['gad7', 'dass21'] },
    ],
  };
  const plan = sanitizePlan(raw, { patientAge: 13, recentRisk: true });
  assert.ok(plan);
  assert.deepEqual(plan.sessions[0].modules, ['registro_inicial']);
  assert.deepEqual(plan.sessions[1].modules, []);
  assert.deepEqual(plan.sessions[2].modules, ['dass21']);
  assert.ok(plan.blockedModules.some((b) => b.id === 'asrs'));
  assert.ok(plan.blockedModules.some((b) => b.id === 'pcl5'));
  assert.ok(plan.blockedModules.some((b) => b.id === 'gad7'));
});

test('buildAiSystemPrompt incluye guardrails F-011 para menor', () => {
  const prompt = buildAiSystemPrompt('CASO 13 años', { patientAge: 13, recentRisk: true });
  assert.match(prompt, /GUARDRAILS CLÍNICOS \(F-011\)/);
  assert.match(prompt, /NO uses ASRS, PCL-5/);
  assert.match(prompt, /coordinar con psiquiatría/);
  assert.doesNotMatch(prompt, /\[asrs\]/i);
  assert.doesNotMatch(prompt, /\[pcl5\]/i);
});

test('parseAiActions aplica guardrails al plan telar', () => {
  const raw = [
    'Programa sugerido.',
    '```telar-plan',
    JSON.stringify({
      sessions: [{ label: 'S1', modules: ['asrs', 'dass21'] }],
    }),
    '```',
  ].join('\n');
  const { actions } = parseAiActions(raw, { patientAge: 13, recentRisk: false });
  assert.deepEqual(actions[0].plan.sessions[0].modules, ['dass21']);
  assert.ok(actions[0].plan.blockedModules.some((b) => b.id === 'asrs'));
});

test('buildAiGuardrailsContext combina edad y riesgo del contexto', () => {
  const ctx = buildAiGuardrailsContext({
    patientBirthDate: '2013-01-15',
    contextText: 'Hospitalización agosto 2026 por ideación suicida.',
  });
  assert.equal(ctx.patientAge, 13);
  assert.equal(ctx.recentRisk, true);
});

test('isAdultOnlyModule marca escalas adultas', () => {
  assert.equal(isAdultOnlyModule('asrs'), true);
  assert.equal(isAdultOnlyModule('dass21'), false);
});
