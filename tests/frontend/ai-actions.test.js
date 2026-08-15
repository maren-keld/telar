import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_QUICK_PROMPTS,
  buildAiSystemPrompt,
  humanizeModuleRefs,
  markAiActionApplied,
  markupModuleRefs,
  parseAiActions,
  planModuleInserts,
} from '../../src/js/ai-actions.js';
import { CUSTOM_ITEM_TYPES } from '../../src/js/custom-module-items.js';
import { isModelPresent } from '../../src/js/ollama-client.js';

test('respuesta sin bloque no genera acciones', () => {
  const { text, actions } = parseAiActions('Sugiero trabajar activación conductual.');
  assert.equal(actions.length, 0);
  assert.equal(text, 'Sugiero trabajar activación conductual.');
});

test('bloque telar-plan se extrae y se quita del texto visible', () => {
  const raw = [
    'Propongo 2 sesiones.',
    '```telar-plan',
    '{"label":"Plan ansiedad","sessions":[{"label":"Evaluación","modules":["gad7"]}]}',
    '```',
  ].join('\n');
  const { text, actions } = parseAiActions(raw);
  assert.equal(text, 'Propongo 2 sesiones.');
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'plan');
  assert.equal(actions[0].plan.label, 'Plan ansiedad');
  assert.deepEqual(actions[0].plan.sessions[0].modules, ['gad7']);
});

test('plan descarta ids de módulo inexistentes y los reporta', () => {
  const raw = [
    '```telar-plan',
    '{"sessions":[{"label":"S1","modules":["gad7","modulo_inventado"]}]}',
    '```',
  ].join('\n');
  const { actions } = parseAiActions(raw);
  assert.deepEqual(actions[0].plan.sessions[0].modules, ['gad7']);
  assert.deepEqual(actions[0].plan.unknownModules, ['modulo_inventado']);
});

test('bloque telar-module normaliza tipos de ítem desconocidos a texto', () => {
  const raw = [
    '```telar-module',
    JSON.stringify({
      title: 'Registro de crisis',
      instructions: 'Completar tras cada crisis',
      questions: [
        { text: '¿Qué la desencadenó?', type: 'text' },
        { text: 'Intensidad', type: 'scale' },
        { text: 'Practicar respiración', type: 'task' },
        { text: 'Tipo raro', type: 'no_existe' },
      ],
    }),
    '```',
  ].join('\n');
  const { actions } = parseAiActions(raw);
  assert.equal(actions.length, 1);
  const q = actions[0].module.questions;
  assert.equal(q.length, 4);
  assert.deepEqual(
    q.map((x) => x.type),
    ['text', 'scale', 'task', 'text'],
  );
});

test('checkbox sin opciones recibe opciones por defecto', () => {
  const raw = [
    '```telar-module',
    '{"title":"T","questions":[{"text":"¿Hubo crisis?","type":"checkbox"}]}',
    '```',
  ].join('\n');
  const { actions } = parseAiActions(raw);
  assert.deepEqual(actions[0].module.questions[0].options, ['Sí', 'No']);
});

test('el JSON suelto con sessions también dispara el diálogo', () => {
  const raw = 'Listo.\n{"label":"X","sessions":[{"label":"S1","modules":["gad7"]}]}';
  const { text, actions } = parseAiActions(raw);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].plan.sessions.length, 1);
  assert.equal(text, 'Listo.');
});

test('bloque telar-plan sin cierre se recupera igual (JSON cortado por tokens)', () => {
  const raw = [
    'Propongo 12 sesiones.',
    '```telar-plan',
    '{"label":"Plan multimodal","sessions":[{"label":"Evaluación","modules":["gad7","dass21"]},{"label":"Psicoeducación","modules":["tcc_abc"]}',
  ].join('\n');
  const { text, actions } = parseAiActions(raw);
  assert.equal(text, 'Propongo 12 sesiones.');
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'plan');
  assert.ok(actions[0].plan.sessions.length >= 1);
  assert.deepEqual(actions[0].plan.sessions[0].modules, ['gad7', 'dass21']);
});

test('el prompt incluye los encabezados de ámbito y prohíbe ids inventados', () => {
  const prompt = buildAiSystemPrompt('CONTEXTO', {
    practitioner: { name: 'Felipe Uppen', grammaticalGender: 'm' },
  });
  assert.match(prompt, /"En Telar:"/);
  assert.match(prompt, /"Fuera de Telar:"/);
  assert.match(prompt, /No inventes ids/);
  assert.match(prompt, /markdown ligero/);
  assert.match(prompt, /CONTEXTO/);
  assert.match(prompt, /Felipe Uppen/);
  assert.match(prompt, /quedo atento/);
  assert.match(prompt, /como máximo UNA vez/);
  assert.match(prompt, /NUNCA incluyas datos del paciente/);
});

test('el editor admite ejercicios, escalas e indicaciones', () => {
  for (const type of ['checkbox', 'text', 'scale', 'task', 'info']) {
    assert.ok(CUSTOM_ITEM_TYPES[type], `falta tipo ${type}`);
  }
  assert.equal(CUSTOM_ITEM_TYPES.checkbox.needsOptions, true);
  assert.equal(CUSTOM_ITEM_TYPES.task.needsOptions, false);
});

test('los ids de módulo citados en el texto se vuelven legibles', () => {
  const out = humanizeModuleRefs(
    '· Sesión 1: GAD-7 [gad7], Modelo ABC — demo [tcc_abc], Probabilidades vs posibilidades [tcc_probabilidades].',
  );
  assert.equal(out, '· Sesión 1: GAD-7, Modelo ABC — demo, Probabilidades vs posibilidades.');
  assert.doesNotMatch(out, /\[|_/);
});

test('un id citado sin su nombre se reemplaza por la etiqueta', () => {
  assert.match(humanizeModuleRefs('Aplica [gad7] al inicio.'), /^Aplica GAD-7 al inicio\.$/);
});

test('los ids inventados desaparecen del texto', () => {
  assert.equal(humanizeModuleRefs('Trabaja esto [modulo_inventado] en sesión.'), 'Trabaja esto en sesión.');
});

test('parseAiActions conserva las citas de módulo para etiquetarlas', () => {
  const { text } = parseAiActions('Usa Probabilidades vs posibilidades [tcc_probabilidades].');
  assert.match(text, /tcc_probabilidades/);
});

test('markupModuleRefs convierte ids sueltos y entre corchetes en tags', () => {
  const html = markupModuleRefs('Trabaja tcc_sesgos y [gad7] en sesión.');
  assert.match(html, /data-module-type="tcc_sesgos"/);
  assert.match(html, /data-module-type="gad7"/);
  assert.doesNotMatch(html, /\[gad7\]/);
  assert.doesNotMatch(html, />tcc_sesgos</);
});

test('markupModuleRefs no duplica el mismo módulo citado dos veces seguidas', () => {
  const html = markupModuleRefs(
    'El módulo Identificando sesgos [tcc_sesgos] [tcc_sesgos] es útil.',
  );
  const hits = html.match(/data-module-type="tcc_sesgos"/g) || [];
  assert.equal(hits.length, 1);
  assert.doesNotMatch(html, /\[tcc_sesgos\]/);
});

test('markupModuleRefs conserva el mismo módulo si aparece en frases distintas', () => {
  const html = markupModuleRefs('Usa [gad7] al inicio y [gad7] al cierre.');
  const hits = html.match(/data-module-type="gad7"/g) || [];
  assert.equal(hits.length, 2);
});

test('los chips de IA explican qué hacen, no pegan el prompt en el tooltip', () => {
  for (const p of AI_QUICK_PROMPTS) {
    assert.ok(p.hint, p.id);
    assert.notEqual(p.hint, p.prompt);
  }
  const programa = AI_QUICK_PROMPTS.find((p) => p.id === 'programa');
  assert.match(programa.prompt, /No repitas handouts/);
  const email = AI_QUICK_PROMPTS.find((p) => p.id === 'email');
  assert.match(email.prompt, /Firma con el nombre del profesional/);
});

test('una acción aplicada conserva la card y marca su estado', () => {
  const raw = [
    'Programa sugerido.',
    '```telar-plan',
    '{"label":"Plan","sessions":[{"label":"S1","modules":["gad7"]}]}',
    '```',
  ].join('\n');
  const persisted = markAiActionApplied(raw, 0);
  const { text, actions } = parseAiActions(persisted);
  assert.equal(text, 'Programa sugerido.');
  assert.equal(actions.length, 1);
  assert.equal(actions[0].applied, true);
  assert.equal(markAiActionApplied(persisted, 0), persisted);
});

test('planModuleInserts calcula un solo lote de filas por sesión', () => {
  const specs = [
    { label: 'S1', modules: ['gad7', 'dass21'] },
    { label: 'S2', modules: ['tcc_abc'] },
  ];
  const { rows, skipped } = planModuleInserts(specs, [10, 11], []);
  assert.deepEqual(
    rows.filter((r) => r.sessionId === 10).map((r) => r.type),
    ['gad7', 'dass21', 'selector_modulo'],
  );
  assert.deepEqual(
    rows.filter((r) => r.sessionId === 10).map((r) => r.sortOrder),
    [0, 1, 2],
  );
  assert.deepEqual(
    rows.filter((r) => r.sessionId === 11).map((r) => r.type),
    ['tcc_abc', 'selector_modulo'],
  );
  assert.equal(skipped, 0);
});

test('planModuleInserts respeta lo ya existente y continúa el sort_order', () => {
  const existing = [
    { session_id: 10, module_type: 'gad7', sort_order: 0 },
    { session_id: 10, module_type: 'selector_modulo', sort_order: 1 },
  ];
  const { rows, skipped } = planModuleInserts([{ modules: ['gad7', 'dass21'] }], [10], existing);
  assert.deepEqual(rows, [{ sessionId: 10, type: 'dass21', sortOrder: 2 }]);
  assert.equal(skipped, 1);
});

test('planModuleInserts descarta tipos inválidos y sesiones sin id', () => {
  const { rows, skipped } = planModuleInserts(
    [{ modules: ['no_existe', 'selector_modulo'] }, { modules: ['gad7'] }],
    [10, undefined],
    [],
  );
  assert.deepEqual(rows, [{ sessionId: 10, type: 'selector_modulo', sortOrder: 0 }]);
  assert.equal(skipped, 2);
});

test('planModuleInserts no duplica módulos de una vez por tratamiento', () => {
  const { rows } = planModuleInserts(
    [{ modules: ['registro_inicial'] }, { modules: ['registro_inicial'] }],
    [10, 11],
    [],
  );
  assert.equal(rows.filter((r) => r.type === 'registro_inicial').length, 1);
});

test('planModuleInserts no repite un handout TCC en otra sesión', () => {
  const { rows, skipped } = planModuleInserts(
    [{ modules: ['tcc_abc'] }, { modules: ['tcc_abc', 'gad7'] }],
    [10, 11],
    [],
  );
  assert.equal(rows.filter((r) => r.type === 'tcc_abc').length, 1);
  assert.equal(rows.filter((r) => r.type === 'gad7').length, 1);
  assert.ok(skipped >= 1);
});

test('el plan parseado deja el handout TCC solo en la primera sesión', () => {
  const raw = [
    '```telar-plan',
    JSON.stringify({
      sessions: [
        { label: 'S1', modules: ['tcc_abc', 'gad7'] },
        { label: 'S2', modules: ['tcc_abc', 'dass21'] },
      ],
    }),
    '```',
  ].join('\n');
  const { actions } = parseAiActions(raw);
  assert.deepEqual(actions[0].plan.sessions[0].modules, ['tcc_abc', 'gad7']);
  assert.deepEqual(actions[0].plan.sessions[1].modules, ['dass21']);
});

test('isModelPresent tolera el tag :latest de Ollama', () => {
  assert.equal(isModelPresent(['mistral:latest'], 'mistral'), true);
  assert.equal(isModelPresent(['qwen2.5:3b'], 'qwen2.5:3b'), true);
  assert.equal(isModelPresent(['qwen2.5:7b'], 'qwen2.5:3b'), false);
  assert.equal(isModelPresent([], 'mistral'), false);
});
