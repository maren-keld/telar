import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCaseStudyData, recommendedModulesForElement, defaultElementIdsForModule } from '../../src/js/case-study-model.js';
import { missingCaseStudyElementsForModule } from '../../src/js/case-study-store.js';
import { axisAssignmentRows } from '../../src/js/workspace-axis-assignment.js';
import { parseAiActions, aiActionsHtml, markAiActionApplied } from '../../src/js/ai-actions.js';
import { mergeCaseStudyAiElements } from '../../src/js/case-study-ai.js';
import { visibleStudyAxes } from '../../src/js/components/workspace-customize.js';
import { summaryHtml } from '../../src/js/views/estudio-de-caso.js';
import { computeVitalRisk } from '../../src/js/vital-risk.js';

test('ejes predeterminados: habilidades; defensas y desarrollo optativos', () => {
  const ids = visibleStudyAxes().map((axis) => axis.id);
  assert.ok(ids.includes('skill'));
  assert.ok(!ids.includes('defense'));
  assert.ok(!ids.includes('development'));
});

test('los detalles protectores y los nuevos ejes sobreviven al guardado', () => {
  const data = normalizeCaseStudyData({ elements: [
    { id: 's', axis: 'skill', title: 'Planificación e inicio de actividades' },
    { id: 'd', axis: 'development', title: 'Retomar estudios' },
    { id: 'r', axis: 'resource', title: 'Actividad física', resourceDetails: ['Fútbol', { text: 'Caminata' }] },
  ] });
  assert.deepEqual(data.elements.slice(0, 2).map((el) => el.axis), ['skill', 'development']);
  assert.deepEqual(normalizeCaseStudyData(data).elements[2].resourceDetails.map((row) => row.text), ['Fútbol', 'Caminata']);
});

test('las habilidades del módulo se incorporan y vinculan como prácticas', () => {
  const elements = [{ id: 's', axis: 'skill', title: 'Evaluación de evidencia e interpretaciones alternativas' }, { id: 'p', axis: 'problem', title: 'Ansiedad alta' }];
  assert.ok(recommendedModulesForElement('skill', elements[0].title).intervention.includes('tcc_socratico'));
  assert.ok(axisAssignmentRows(elements, 'tcc_socratico').every((row) => row.recommended));
  assert.deepEqual(defaultElementIdsForModule('tcc_socratico', elements), ['s', 'p']);
  assert.ok(missingCaseStudyElementsForModule('tcc_socratico', []).every((el) => el.axis === 'skill'));
  assert.ok(missingCaseStudyElementsForModule('tcc_socratico', []).some((el) => el.title === elements[0].title));
});

test('propuestas individuales quedan pendientes y pueden aplicarse sin duplicar elementos', () => {
  const row = { axis: 'skill', title: 'Identificación emocional', manifestations: ['Reconoce tristeza en el registro'], explanation: 'Evidencia explícita del registro.' };
  const raw = `Justificación\n\`\`\`telar-element\n${JSON.stringify(row)}\n\`\`\``;
  const result = parseAiActions(raw);
  assert.equal(result.text, 'Justificación');
  assert.equal(result.actions[0].applied, false);
  assert.match(aiActionsHtml(result.actions, 1), /Incorporar/);
  assert.equal(parseAiActions(markAiActionApplied(raw, 0)).actions[0].applied, true);
  const merged = mergeCaseStudyAiElements({}, [row]);
  assert.equal(merged.added, 1);
  assert.equal(mergeCaseStudyAiElements(merged.caseStudy, [row]).added, 0);
});

test('priorización se presenta para aceptación explícita', () => {
  const parsed = parseAiActions('Razones\n```telar-priority\n{"titles":["Ansiedad alta","Insomnio"]}\n```');
  assert.equal(parsed.actions[0].type, 'priority');
  assert.deepEqual(parsed.actions[0].titles, ['Ansiedad alta', 'Insomnio']);
  assert.equal(parsed.text, 'Razones');
});

test('dashboard ofrece cuatro acciones y habilita priorizar desde dos problemas', async () => {
  const { studyAiCardHtml } = await import('../../src/js/views/estudio-de-caso.js');
  const one = studyAiCardHtml({ elements: [{ axis: 'problem', title: 'Ansiedad' }] });
  assert.equal((one.match(/<button/g) || []).length, 4);
  assert.match(one, /data-study-ai="prioritize" disabled/);
  const two = studyAiCardHtml({ elements: [{ axis: 'problem', title: 'Ansiedad' }, { axis: 'problem', title: 'Insomnio' }] });
  assert.doesNotMatch(two, /data-study-ai="prioritize" disabled/);
});

import { STUDY_AI_REQUESTS, resourceDetailSpec, normalizePriorityTitles, normalizePriorityResponse } from '../../src/js/study-ai-ui.js';
import { renderAiMarkdown } from '../../src/js/ai-markdown.js';

test('consultas visibles no exponen las instrucciones de acciones', () => {
  for (const request of Object.values(STUDY_AI_REQUESTS)) {
    assert.ok(request.question.length < 60);
    assert.doesNotMatch(request.question, /JSON|```|telar-/);
    assert.ok(request.instructions.length > request.question.length);
  }
});

test('priorización conserva todos los nombres exactos y pone seguridad primero', () => {
  const elements = [
    { axis: 'problem', title: 'Insomnio' },
    { axis: 'problem', title: 'Suicidalidad' },
    { axis: 'problem', title: 'Ansiedad alta' },
    { axis: 'resource', title: 'Creatividad' },
  ];
  assert.deepEqual(normalizePriorityTitles(['Ansiedad alta (En desarrollo)', 'Insomnio', 'Ansiedad alta', 'Inventado'], elements), ['Suicidalidad', 'Ansiedad alta', 'Insomnio']);
  const raw = 'Razones\n```telar-priority\n{"titles":["Ansiedad alta (En desarrollo)","Insomnio"]}\n```';
  assert.deepEqual(parseAiActions(normalizePriorityResponse(raw, elements)).actions[0].titles, ['Suicidalidad', 'Ansiedad alta', 'Insomnio']);
  assert.deepEqual(normalizePriorityTitles(['Ansiedad alta'], elements.filter((el) => el.title !== 'Suicidalidad')), ['Ansiedad alta', 'Insomnio']);
});

test('actividades concretas se limitan a tres factores y tienen ejemplos propios', () => {
  for (const title of ['Creatividad', 'Actividad física', 'Participación en comunidad']) assert.ok(resourceDetailSpec({ axis: 'resource', title }));
  for (const title of ['Red de apoyo', 'Insight', 'Adaptabilidad', 'Tolerancia a la frustración']) assert.equal(resourceDetailSpec({ axis: 'resource', title }), null);
  assert.doesNotMatch(resourceDetailSpec({ axis: 'resource', title: 'Creatividad' }).placeholder, /fútbol/);
  assert.equal(resourceDetailSpec({ axis: 'skill', title: 'Creatividad' }), null);
});

test('respuestas y tarjetas formatean seis niveles de encabezado sin ejecutar HTML', () => {
  const html = renderAiMarkdown('#### Resultado\n*Una hipótesis*\n<script>alert(1)</script>');
  assert.match(html, /<strong>Resultado<\/strong>/);
  assert.match(html, /<em>Una hipótesis<\/em>/);
  assert.doesNotMatch(html, /####|<script>/);
  const card = aiActionsHtml([{ type: 'element', element: { title: 'Creatividad', explanation: '#### Evidencia\n*Por confirmar*' } }], 1);
  assert.doesNotMatch(card, /####|\*Por confirmar\*/);
  assert.match(card, /ai-dialog__summary/);
});

test('propuestas etiquetadas sin cercado ocultan el JSON y conservan el texto posterior', () => {
  const element = { axis: 'problem', title: 'Ansiedad por falta de control', manifestations: ['GAD-7=10'], explanation: 'Evaluar {contexto} y una "alternativa".' };
  for (const label of ['- Telar-element:', '**Telar-element**:', '**Telar-element:**']) {
    const raw = `Problemas registrados\n${label}\n      json\n      ${JSON.stringify(element)}\n\n2. Otro problema.`;
    const parsed = parseAiActions(raw);
    assert.equal(parsed.actions.length, 1);
    assert.equal(parsed.actions[0].element.title, element.title);
    assert.match(parsed.text, /Problemas registrados/);
    assert.match(parsed.text, /2\. Otro problema/);
    assert.doesNotMatch(parsed.text, /telar-element|"axis"|json/i);
    assert.equal(parseAiActions(markAiActionApplied(raw, 0)).actions[0].applied, true);
  }
});

test('subramas de la red excluyen personas fallecidas antes del límite de tres', () => {
  const caseStudy = normalizeCaseStudyData({ elements: [{ axis: 'resource', title: 'Red de apoyo', people: [
    { name: 'Antonio', domain: 'Fallecido' }, { name: 'Deisy', domain: 'Fallecido' },
    { name: 'Jimmy', domain: 'Contacto limitado' }, { name: 'Debora', domain: 'Apoyo emocional' },
    { name: 'Sofía', domain: 'Apoyo práctico' }, { name: 'Luis', domain: 'Armonía' },
  ] }] });
  const html = summaryHtml(caseStudy, [], computeVitalRisk({ caseStudy }));
  const branches = html.match(/<ul class="estudio-resource-branches">([\s\S]*?)<\/ul>/)?.[1];
  assert.ok(branches);
  assert.doesNotMatch(branches, /Antonio|Deisy|Luis/);
  assert.match(branches, /Jimmy/);
  assert.match(branches, /Debora/);
  assert.match(branches, /Sofía/);
  assert.equal(caseStudy.elements.find(el => el.kind === 'support_network').people.length, 6);
});

test('Riesgo vital muestra solo escalas incorporadas y no contradice riesgos registrados', () => {
  const empty = computeVitalRisk();
  assert.ok(!empty.findings.some(value => /GAD-7|DASS-21/.test(value)));
  const withRisk = computeVitalRisk({
    sessions: [{ modules: [{ module_type: 'gad7', data: JSON.stringify({ answers: [1, 1, 1, 1, 1, 1, 1] }) }] }],
    caseStudy: { elements: [{ axis: 'risk', title: 'Vulnerabilidad', status: 'developing' }] },
  });
  assert.ok(withRisk.findings.includes('GAD-7: 7 puntos'));
  assert.ok(!withRisk.findings.some(value => /DASS-21|Sin elementos de riesgo/.test(value)));
  const withDass = computeVitalRisk({ sessions: [{ modules: [{ module_type: 'dass21', data: '{}' }] }] });
  assert.ok(withDass.findings.includes('DASS-21 ansiedad: sin registro'));
});
