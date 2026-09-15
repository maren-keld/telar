import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyProfileCheckToCaseStudy,
  customPlaceholderForAxis,
  emptyCaseStudyElement,
  ESTUDIO_NAV,
  fieldHintFor,
  normalizeCaseStudyData,
  normalizeCaseStudyElement,
  profileLiteFromCaseStudy,
  PROFILE_AXIS_MAP,
  STATUS_LABELS,
  statusLabelFor,
  SUPPORT_NETWORK_KIND,
  SUPPORT_NETWORK_TITLE,
  suggestedModulesForAxis,
} from '../../src/js/case-study-model.js';
import {
  essentialWordsFromCaseStudy,
  estudioRelationForModule,
  libraryItemsForAxis,
  libraryPresetFor,
  namedSupportPeople,
  summaryDotTone,
  summaryDotsForAxis,
} from '../../src/js/case-study-catalog.js';
import { elementLibraryHtml, statusToggleHtml, summaryScorecardHtml } from '../../src/js/views/estudio-de-caso.js';
import {
  caseStudyAiSourceText,
  fallbackCaseStudyRows,
  mergeCaseStudyAiElements,
  parseCaseStudyAiResult,
} from '../../src/js/case-study-ai.js';
import { previewHtml } from '../../src/js/components/module-selector.js';
import {
  isEstudioWorkspaceMode,
  isInformeWorkspaceMode,
  listAddableModuleOptions,
  PROGRAM_ADD_BLOCKLIST,
  setWorkspaceIndexMode,
} from '../../src/js/workspace-index-mode.js';
import { getModuleDef } from '../../src/js/config.js';
import { CATEGORIES, LIBRARY_HIDDEN_TYPES } from '../../src/js/module-categories.js';
import { getTreatmentTemplate } from '../../src/js/treatment-templates.js';
import { selectorListInnerHtml } from '../../src/js/components/module-selector.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('normalizeCaseStudyData migra problemas y checks de perfil e incluye eje Otros', () => {
  const study = normalizeCaseStudyData(
    {},
    {
      resource: [{ axis: 'resource', title: 'Red familiar', status: 'active' }],
      defense: [{ axis: 'defense', title: 'Humor', status: 'active' }],
      risk: [{ axis: 'risk', title: 'Aislamiento', status: 'active' }],
    },
    {
      problems: [
        {
          name: 'Déficit atencional',
          assigned: true,
          indicators: [{ text: 'Olvida tareas', checked: false }],
          objectives: [{ text: 'Organizar la semana', checked: false }],
        },
      ],
      supportPeople: [{ name: 'Ana', relation: 'Madre', domain: 'Apoyo emocional', notes: 'Cercana' }],
    },
  );

  assert.equal(study.elements.length, 5);
  assert.ok(study.elements.some((el) => el.kind === SUPPORT_NETWORK_KIND));
  assert.equal(study.elements.find((el) => el.kind === SUPPORT_NETWORK_KIND).title, SUPPORT_NETWORK_TITLE);
  assert.deepEqual(
    study.elements.map((el) => el.axis),
    ['problem', 'resource', 'defense', 'risk', 'resource'],
  );
  assert.equal(study.elements[0].title, 'Déficit atencional');
  assert.equal(study.supportPeople[0].name, 'Ana');
  assert.equal(PROFILE_AXIS_MAP.fortalezas, 'resource');
});

test('Perfil lite sync marca y desmarca el mismo modelo', () => {
  let study = normalizeCaseStudyData({
    elements: [{ axis: 'resource', title: 'Autocuidado', status: 'active' }],
  });
  study = applyProfileCheckToCaseStudy(study, 'defensas', 'Humor', true);
  assert.ok(study.elements.some((el) => el.axis === 'defense' && el.title === 'Humor'));
  study = applyProfileCheckToCaseStudy(study, 'defensas', 'Humor', false);
  assert.equal(
    study.elements.some((el) => el.axis === 'defense' && el.title === 'Humor'),
    false,
  );
  const lite = profileLiteFromCaseStudy(
    normalizeCaseStudyData({
      elements: [
        { axis: 'resource', title: 'Autocuidado' },
        { axis: 'problem', title: 'Ansiedad' },
      ],
    }),
  );
  assert.deepEqual(lite.fortalezas, ['Autocuidado']);
  assert.deepEqual(lite.defensas, []);
});

test('elementos exponen M/I/O/E + notas en filas (shape)', () => {
  const el = normalizeCaseStudyData({
    elements: [
      {
        axis: 'problem',
        title: 'Ansiedad ante plazos',
        manifestations: ['Taquicardia'],
        indicators: [{ text: 'GAD-7 ≥10', checked: true }],
        objectives: [{ text: 'Bajar ansiedad', checked: false }],
        evidence: ['Relato en sesión 2'],
        notes: 'Revisar sueño',
      },
    ],
  }).elements[0];

  assert.equal(el.manifestations[0].text, 'Taquicardia');
  assert.equal(el.indicators[0].checked, true);
  assert.equal(el.objectives[0].text, 'Bajar ansiedad');
  assert.equal(el.evidence[0].text, 'Relato en sesión 2');
  assert.equal(el.notes, 'Revisar sueño');
});

test('espacio de trabajo distingue informe vs estudio', () => {
  setWorkspaceIndexMode('chrono');
  assert.equal(isInformeWorkspaceMode(), true);
  assert.equal(isEstudioWorkspaceMode(), false);
  setWorkspaceIndexMode('estudio');
  assert.equal(isEstudioWorkspaceMode(), true);
  assert.equal(isInformeWorkspaceMode(), false);
  setWorkspaceIndexMode('category');
  assert.equal(isInformeWorkspaceMode(), true);
  setWorkspaceIndexMode('chrono');
});

test('Redes de apoyo no es agregable al programa; sí existe en librería', () => {
  assert.equal(PROGRAM_ADD_BLOCKLIST.has('redes_apoyo'), true);
  assert.ok(getModuleDef('redes_apoyo'));
  const addable = new Set(listAddableModuleOptions().map((m) => m.type));
  assert.equal(addable.has('redes_apoyo'), false);
  const conceptualizacion = CATEGORIES.find((c) => c.id === 'conceptualizacion');
  assert.equal(conceptualizacion.types.includes('redes_apoyo'), false);

  for (const id of ['tdah_8', 'tdah_nf_8', 'trauma_regulacion']) {
    const tpl = getTreatmentTemplate(id);
    const ids = tpl.sessions.flatMap((s) => s.modules);
    assert.equal(ids.includes('redes_apoyo'), false, `${id} no debe sembrar redes_apoyo`);
  }
});

test('Diagnósticos sale de librería, add-picker y plantillas (legacy renderer se conserva)', () => {
  assert.equal(LIBRARY_HIDDEN_TYPES.has('diagnostico'), true);
  assert.equal(PROGRAM_ADD_BLOCKLIST.has('diagnostico'), true);
  assert.ok(getModuleDef('diagnostico'));
  const conceptualizacion = CATEGORIES.find((c) => c.id === 'conceptualizacion');
  assert.equal(conceptualizacion.types.includes('diagnostico'), false);
  const addable = new Set(listAddableModuleOptions().map((m) => m.type));
  assert.equal(addable.has('diagnostico'), false);
  const html = selectorListInnerHtml();
  assert.doesNotMatch(html, /Diagnósticos/);
  for (const id of ['tdah_8', 'tdah_nf_8', 'trauma_regulacion']) {
    const tpl = getTreatmentTemplate(id);
    const ids = tpl.sessions.flatMap((s) => s.modules);
    assert.equal(ids.includes('diagnostico'), false, `${id} no debe sembrar diagnostico`);
  }
});

test('leftSidebar Estudio: Resumen, ejes, Evolución y Bots/Agentes', () => {
  assert.deepEqual(
    ESTUDIO_NAV.map((n) => n.id),
    ['summary', 'problem', 'resource', 'defense', 'risk', 'scores', 'other'],
  );
  assert.equal(ESTUDIO_NAV.find((n) => n.id === 'resource').label, 'Factores protectores');
  assert.equal(ESTUDIO_NAV.find((n) => n.id === 'risk').label, 'Riesgos');
  assert.equal(ESTUDIO_NAV.find((n) => n.id === 'scores').label, 'Evolución');
  assert.equal(ESTUDIO_NAV.find((n) => n.id === 'other').label, 'Bots/Agentes');
});

test('Actividades sugieren módulos por eje; red de apoyo es Personas', () => {
  assert.ok(suggestedModulesForAxis('problem').includes('gad7'));
  const study = normalizeCaseStudyData({});
  const net = study.elements.find((el) => el.kind === SUPPORT_NETWORK_KIND);
  assert.ok(net);
  assert.equal(net.axis, 'resource');
});

test('chrome Índice usa Categoría y Sesiones; rail sin tabs Puntajes/Ejes/Herramientas', () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const tools = readFileSync(join(root, '../../src/js/components/workspace-tools-menu.js'), 'utf8');
  const patient = readFileSync(join(root, '../../src/js/components/workspace-patient-menu.js'), 'utf8');
  const notes = readFileSync(join(root, '../../src/js/components/notes-panel.js'), 'utf8');
  assert.match(tools, /Categoría/);
  assert.match(tools, /Sesiones/);
  assert.doesNotMatch(tools, /Por categoría/);
  assert.match(patient, /Categoría/);
  assert.match(patient, />\s*Sesiones\s*</);
  assert.doesNotMatch(notes, /data-tab="puntajes"/);
  assert.doesNotMatch(notes, /data-tab="herramientas"/);
  assert.doesNotMatch(notes, /data-tab="perfil"/);
});

test('Estudio entra en Resumen si no hay selectedNav guardado', () => {
  const study = normalizeCaseStudyData({
    elements: [{ axis: 'problem', title: 'Ansiedad' }],
  });
  assert.equal(study.selectedNav, 'summary');
});

test('estados del elemento son presente / en desarrollo / desconocido (default desconocido)', () => {
  const fresh = emptyCaseStudyElement('problem', 'Ansiedad');
  assert.equal(fresh.status, 'unknown');
  assert.equal(STATUS_LABELS.present, 'Presente');
  assert.equal(statusLabelFor('problem', 'present'), 'Gestionado');
  assert.equal(statusLabelFor('risk', 'present'), 'Gestionado');
  assert.equal(statusLabelFor('resource', 'present'), 'Presente');
  assert.equal(STATUS_LABELS.developing, 'En desarrollo');
  assert.equal(STATUS_LABELS.unknown, 'Desconocido');
  assert.equal(normalizeCaseStudyElement({ axis: 'problem', title: 'X', status: 'active' }).status, 'present');
  assert.equal(normalizeCaseStudyElement({ axis: 'risk', title: 'Y', status: 'in_progress' }).status, 'developing');
  const html = statusToggleHtml('unknown');
  assert.match(html, /data-status-set="present"/);
  assert.match(html, /data-status-set="developing"/);
  assert.match(html, /data-status-set="unknown"/);
  assert.doesNotMatch(html, /<select/);
  assert.match(html, /En desarrollo/);
  assert.match(html, /Desconocido/);
  assert.doesNotMatch(html, /A desarrollar/);
  assert.doesNotMatch(html, /Desconocidos/);
});

test('+ Añadir elemento abre librería del eje, no session_modules', () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const view = readFileSync(join(root, '../../src/js/views/estudio-de-caso.js'), 'utf8');
  const workspace = readFileSync(join(root, '../../src/js/views/workspace.js'), 'utf8');
  assert.match(view, /data-open-library/);
  assert.match(view, /elementLibraryHtml/);
  assert.doesNotMatch(view, /center-add-module/);
  assert.match(workspace, /data-add-element/);
  const study = normalizeCaseStudyData({});
  const lib = elementLibraryHtml('defense', study);
  assert.match(lib, /Librería de defensas/);
  assert.match(lib, /Humor/);
  assert.match(lib, /Defensa personalizada/);
  assert.doesNotMatch(lib, /Título personalizado/);
  const problemsLib = elementLibraryHtml('problem', study);
  assert.match(problemsLib, /Problema personalizado/);
  assert.ok(libraryItemsForAxis('problem').some((item) => item.title === 'Ansiedad alta'));
  assert.ok(libraryItemsForAxis('resource').some((item) => item.title === 'Autocuidado'));
});

test('Resumen: dots athletic por eje y genograma si hay personas', () => {
  const study = normalizeCaseStudyData({
    elements: [
      { axis: 'problem', title: 'Ansiedad', status: 'present' },
      { axis: 'resource', title: 'Autocuidado', status: 'developing' },
      { axis: 'defense', title: 'Humor', status: 'present' },
      { axis: 'defense', title: 'Negación', status: 'unknown' },
      { axis: 'risk', title: 'Aislamiento social', status: 'present' },
      {
        axis: 'resource',
        kind: SUPPORT_NETWORK_KIND,
        title: SUPPORT_NETWORK_TITLE,
        people: [{ name: 'Ana', relation: 'Madre' }],
      },
    ],
  });
  assert.equal(summaryDotTone(study.elements.find((el) => el.title === 'Ansiedad')), 'red');
  assert.equal(summaryDotTone(study.elements.find((el) => el.title === 'Autocuidado')), 'green');
  assert.equal(summaryDotTone(study.elements.find((el) => el.title === 'Humor')), 'green');
  assert.equal(summaryDotTone(study.elements.find((el) => el.title === 'Negación')), 'red');
  assert.equal(summaryDotTone(study.elements.find((el) => el.title === 'Aislamiento social')), 'yellow');
  assert.equal(summaryDotsForAxis(study, 'problem').length, 1);
  assert.equal(namedSupportPeople(study)[0].name, 'Ana');
  const html = summaryScorecardHtml(study);
  assert.match(html, /estudio-score-dot--red/);
  assert.match(html, /estudio-score-dot--green/);
  assert.match(html, /estudio-score-dot--yellow/);
  assert.match(html, /data-nav="problem"/);
  assert.match(html, /data-nav="resource"/);
  assert.match(html, /Factores protectores/);
  assert.match(html, /Riesgos/);
});

test('ejes vacíos siguen en el nav y el centro ofrece empty state', () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const view = readFileSync(join(root, '../../src/js/views/estudio-de-caso.js'), 'utf8');
  const css = readFileSync(join(root, '../../src/css/estudio-caso.css'), 'utf8');
  assert.match(view, /Sin elementos en este eje/);
  assert.match(view, /Abrir librería/);
  assert.match(css, /font-size: 13px/);
  assert.match(css, /\.estudio-element__notes::placeholder/);
  assert.match(view, /selectedNav = 'summary'/);
});

test('FAIL-3: hints M/I/O/E, placeholder por eje, PDF y librería módulos', () => {
  assert.equal(customPlaceholderForAxis('resource'), 'Recurso o factor protector personalizado');
  assert.equal(customPlaceholderForAxis('risk'), 'Vulnerabilidad o riesgo personalizado');
  const objHint = fieldHintFor('problem', 'objectives');
  const evHint = fieldHintFor('problem', 'evidence');
  assert.match(objHint, /Qué se busca trabajar/);
  assert.doesNotMatch(objHint, /objetivos para desarrollar/i);
  assert.match(evHint, /fecha/);
  assert.doesNotMatch(evHint, /evidencia de mejora/i);
  assert.match(fieldHintFor('problem', 'indicators'), /puntajes asociados|GAD-7/);

  const preset = libraryPresetFor('problem', 'Ansiedad alta');
  assert.ok(preset.indicators.some((t) => /DASS-21/.test(t)));
  assert.ok(preset.objectives.includes('Reducir niveles de ansiedad'));

  const gad = estudioRelationForModule('gad7');
  assert.equal(gad.axis, 'problem');
  assert.equal(gad.element, 'Ansiedad alta');
  assert.equal(gad.axisLabel, 'Problemas');

  const words = essentialWordsFromCaseStudy({
    elements: [{ axis: 'problem', title: 'Ansiedad alta', manifestations: [{ text: 'Rumiación nocturna' }] }],
  });
  assert.ok(words.some((w) => w.word.includes('ansiedad')));
  assert.ok(words.some((w) => w.word.includes('rumi')));

  const root = dirname(fileURLToPath(import.meta.url));
  const view = readFileSync(join(root, '../../src/js/views/estudio-de-caso.js'), 'utf8');
  const pdf = readFileSync(join(root, '../../src/js/export-treatment-pdf.js'), 'utf8');
  const css = readFileSync(join(root, '../../src/css/estudio-caso.css'), 'utf8');
  assert.match(view, /data-support-field="relation"/);
  assert.match(view, /<select data-support-field="relation"/);
  assert.match(view, /<select data-support-field="domain"/);
  assert.doesNotMatch(view, /iconForElement/);
  assert.match(view, /sessionsCardHtml/);
  assert.match(view, /scoreTabsHtml/);
  assert.match(view, /estudio-resumen-scores/);
  assert.doesNotMatch(view, /wordCloudHtml/);
  assert.doesNotMatch(view, /Nube de palabras/);
  assert.match(view, /scrollCenterTop/);
  assert.match(view, /estudio-axis-nav__child/);
  assert.match(pdf, /appendCaseStudyPdf/);
  assert.match(css, /estudio-library__item/);
  assert.match(css, /min-height: 72px/);
  assert.match(css, /font-size: 0\.78rem/);
  assert.match(view, /refreshAxisNav/);
  assert.match(view, /const geno = people\.length/);
  // Resumen: genograma al final; sin card Mapa del caso
  const summaryFn = view.slice(view.indexOf('function summaryHtml'), view.indexOf('export async function mountEstudioDeCaso'));
  assert.match(summaryFn, /\$\{geno\}/);
  assert.ok(summaryFn.indexOf('${geno}') > summaryFn.indexOf('estudio-summary__axes'));
  assert.doesNotMatch(summaryFn, /summaryScorecardHtml/);

  const preview = previewHtml('gad7', { label: 'GAD-7 — Ansiedad generalizada' }, null);
  assert.match(preview, /En Estudio de caso/);
  assert.match(preview, /Problemas/);
  assert.match(preview, /Ansiedad alta/);
});

test('autocompletar ejes usa solo anamnesis y registro inicial, sin pisar notas clínicas', () => {
  const source = caseStudyAiSourceText([
    {
      number: 1,
      modules: [
        { module_type: 'registro_inicial', data: JSON.stringify({ ocupaciones: 'Estudiante' }) },
        { module_type: 'motivo_consulta', data: JSON.stringify({ motivo: 'Refiere insomnio y ansiedad nocturna.' }) },
        { module_type: 'nota_sesion', data: JSON.stringify({ notes: 'No debe entrar.' }) },
      ],
    },
  ]);
  assert.match(source, /Registro inicial/);
  assert.match(source, /Anamnesis/);
  assert.doesNotMatch(source, /No debe entrar/);

  const rows = parseCaseStudyAiResult('```json\n{"elements":[{"axis":"problem","title":"Insomnio","status":"present","manifestations":["Refiere insomnio"],"indicators":["Ansiedad nocturna"]}]}\n```');
  const merged = mergeCaseStudyAiElements({ elements: [{ axis: 'problem', title: 'Insomnio', notes: 'Nota clínica propia.' }] }, rows);
  assert.equal(merged.changed, 1);
  assert.equal(merged.added, 0);
  assert.equal(merged.caseStudy.elements[0].notes, 'Nota clínica propia.');
  assert.equal(merged.caseStudy.elements[0].manifestations[0].text, 'Refiere insomnio');
});

test('autocompletar acepta ejes en español y evidencia alternativa de la IA', () => {
  const rows = parseCaseStudyAiResult('{"ejes":[{"eje":"problemas","title":"Control de ira","evidencia":["Refiere que explota rápidamente"]}]}');
  const merged = mergeCaseStudyAiElements({ elements: [] }, rows);
  assert.equal(merged.added, 1);
  const problem = merged.caseStudy.elements.find((element) => element.title === 'Control de ira');
  assert.equal(problem.axis, 'problem');
  assert.equal(problem.manifestations[0].text, 'Refiere que explota rápidamente');
});

test('autocompletar acepta un arreglo JSON directo y objetos de evidencia', () => {
  const rows = parseCaseStudyAiResult('[{"eje":"riesgos","nombre":"Consumo","evidencia":{"text":"Refiere consumo de cannabis"}}]');
  const merged = mergeCaseStudyAiElements({ elements: [] }, rows);
  assert.equal(merged.added, 1);
  const consumo = merged.caseStudy.elements.find((element) => element.title === 'Consumo');
  assert.equal(consumo.manifestations[0].text, 'Refiere consumo de cannabis');
});

test('autocompletar tiene respaldo literal para anamnesis extensa', () => {
  const rows = fallbackCaseStudyRows(`Motivo: evitar despido\nReducir consumo de marihuana.\nMe gustaría controlar mi ira cuando exploto.\nDuermo 4 a 5 horas.\nCelos y desconfianza con mi pareja.`);
  assert.ok(rows.length >= 4);
  assert.ok(rows.some((row) => row.title === 'Consumo de cannabis'));
  assert.ok(rows.some((row) => row.title === 'Alteraciones del sueño'));
});

test('autocompletar literal cubre evidencia clínica aunque la IA responda pocos ejes', () => {
  const rows = fallbackCaseStudyRows(`Evitar situación de agresividad con mi pareja.
Reducir consumo de marihuana.
Me cuesta controlar mi ira cuando exploto.
Duermo 4 a 5 horas.
Celos y desconfianza con mi pareja.
Me afecta mucho lo que dicen mis compañeros.`);
  assert.ok(rows.some((row) => row.title === 'Agresividad e impulsividad'));
  assert.ok(rows.some((row) => row.title === 'Consumo de cannabis'));
  assert.ok(rows.some((row) => row.title === 'Alteraciones del sueño'));
  assert.ok(rows.some((row) => row.title === 'Celos y desconfianza'));
});
