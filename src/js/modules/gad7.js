import { bindAutoSave, collectFormData } from '../autobind.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, parseJsonSafe } from '../utils.js';
import { workspaceAutoSaveStatus } from '../save-status.js';
import { t } from '../i18n.js';

const TOTAL = 7;

function options() {
  return [
    { v: 0, label: t('gad7.opt0', 'Para nada') },
    { v: 1, label: t('gad7.opt1', 'Varios días') },
    { v: 2, label: t('gad7.opt2', 'Más de la mitad de los días') },
    { v: 3, label: t('gad7.opt3', 'Casi todos los días') },
  ];
}

function items() {
  return [
    t('gad7.q1', 'Sentirse nervioso/a, ansioso/a o con los nervios de punta'),
    t('gad7.q2', 'No poder dejar de preocuparse o no poder controlar la preocupación'),
    t('gad7.q3', 'Preocuparse demasiado por diferentes cosas'),
    t('gad7.q4', 'Dificultad para relajarse'),
    t('gad7.q5', 'Estar tan inquieto/a que es difícil quedarse quieto/a'),
    t('gad7.q6', 'Molestarse o irritarse fácilmente'),
    t('gad7.q7', 'Sentir miedo como si algo horrible fuera a suceder'),
  ];
}

const BANDS = [
  { max: 4, labelKey: 'gad7.band.minimal', label: 'Ansiedad mínima', cls: 'gad7-band--minimal' },
  { max: 9, labelKey: 'gad7.band.mild', label: 'Ansiedad leve', cls: 'gad7-band--mild' },
  { max: 14, labelKey: 'gad7.band.moderate', label: 'Ansiedad moderada', cls: 'gad7-band--moderate' },
  { max: 21, labelKey: 'gad7.band.severe', label: 'Ansiedad severa', cls: 'gad7-band--severe' },
];

function computeTotal(answers) {
  let sum = 0;
  let any = false;
  for (let i = 0; i < TOTAL; i++) {
    const v = answers[i];
    if (v === null || v === undefined || v === '') continue;
    sum += Number(v);
    any = true;
  }
  return any ? sum : null;
}

function countAnswered(answers) {
  return answers.filter((v) => v !== null && v !== undefined && v !== '').length;
}

function band(total) {
  if (total === null) return { label: '—', cls: '' };
  const b = BANDS.find((x) => total <= x.max) || BANDS[BANDS.length - 1];
  return { label: t(b.labelKey, b.label), cls: b.cls };
}

function itemRowHtml(idx, text, selected, opts) {
  return `
    <div class="likert-row gad7-row">
      <div class="likert-row__q">
        <span class="likert-row__n">${idx + 1}.</span>
        <span>${escapeHtml(text)}</span>
      </div>
      <div class="likert-row__opts gad7-row__opts" role="radiogroup" aria-label="${escapeHtml(t('gad7.response', 'Respuesta'))} ${idx + 1}">
        ${opts.map((o) => {
          const checked =
            selected !== null && selected !== '' && Number(selected) === o.v ? 'checked' : '';
          return `<label class="likert-opt gad7-opt" title="${escapeHtml(o.label)}">
            <input type="radio" name="q${idx}" value="${o.v}" ${checked} />
            <span class="likert-dot"></span>
            <span class="gad7-opt__label">${escapeHtml(o.label)}</span>
          </label>`;
        }).join('')}
      </div>
    </div>`;
}

function answersFromForm(form) {
  const fd = collectFormData(form);
  return Array.from({ length: TOTAL }, (_, i) => {
    const v = fd[`q${i}`];
    return v === undefined ? null : Number(v);
  });
}

export async function renderGad7(host, moduleRow) {
  const data = parseJsonSafe(moduleRow.data, {});
  const answers = Array.isArray(data.answers) ? data.answers : Array(TOTAL).fill(null);
  const total = computeTotal(answers);
  const b = band(total);
  const answeredCount = countAnswered(answers);
  const opts = options();
  const itemList = items();

  host.innerHTML = `
    <div class="card psych-module gad7-module">
      <div class="psych-module__head">
        <div class="module-card-head">
          <div>
            <h2 class="module-title" style="margin:0">${escapeHtml(t('gad7.title', 'GAD-7 — Ansiedad generalizada'))}</h2>
            <p class="module-card-head__sub">${escapeHtml(t('gad7.subtitle', '7 ítems · escala 0–3 · últimas 2 semanas · una vez por sesión.'))}</p>
          </div>
          <div class="badge badge--info module-card-head__badge" id="gad7-progress" title="${escapeHtml(t('gad7.progress', 'Ítems respondidos'))}">${answeredCount}/${TOTAL}</div>
        </div>

        <div class="psych-scores gad7-scores" id="gad7-scores">
          <div class="psych-score-pill gad7-score-pill ${b.cls}" id="gad7-pill">
            <span class="psych-score-pill__label">${escapeHtml(t('gad7.total', 'Puntuación total'))}</span>
            <strong id="gad7-score">${total === null ? '—' : total}</strong>
            <span id="gad7-label">${escapeHtml(b.label)}</span>
          </div>
        </div>
      </div>

      <div class="psych-module__scroll">
        <form id="gad7-form" class="likert-form gad7-form">
          <div class="likert-head gad7-head">
            <div class="likert-head__q">${escapeHtml(t('gad7.item', 'Ítem'))}</div>
            <div class="likert-head__opts gad7-head__opts">
              ${opts.map((o) => `<span title="${escapeHtml(o.label)}">${escapeHtml(o.label)}</span>`).join('')}
            </div>
          </div>
          ${itemList.map((text, idx) => itemRowHtml(idx, text, answers[idx], opts)).join('')}
        </form>

        <p class="gad7-note">${escapeHtml(t('gad7.note', 'Tamizaje de trastorno de ansiedad generalizada (Spitzer et al., 2006). No sustituye evaluación clínica integral.'))}</p>
      </div>
    </div>
  `;

  const form = host.querySelector('#gad7-form');
  const progressEl = host.querySelector('#gad7-progress');

  const persist = async () => {
    const next = answersFromForm(form);
    await syncModuleReadableText(moduleRow, { answers: next }, 'completado');
  };
  bindAutoSave(form, persist, workspaceAutoSaveStatus());

  const recomputeLive = () => {
    const next = answersFromForm(form);
    const tTotal = computeTotal(next);
    const bNext = band(tTotal);
    const answered = countAnswered(next);

    if (progressEl) progressEl.textContent = `${answered}/${TOTAL}`;

    const scoreEl = host.querySelector('#gad7-score');
    const labelEl = host.querySelector('#gad7-label');
    const pill = host.querySelector('#gad7-pill');

    if (scoreEl) scoreEl.textContent = tTotal === null ? '—' : String(tTotal);
    if (labelEl) labelEl.textContent = bNext.label;
    if (pill) pill.className = `psych-score-pill gad7-score-pill ${bNext.cls}`;
  };

  form.addEventListener('change', recomputeLive);
  form.addEventListener('input', recomputeLive);
}

/** Resumen numérico para exportación PDF. */
export function gad7Summary(data) {
  const answers = data?.answers || [];
  if (!answers.some((v) => v !== null && v !== '')) return null;
  const total = answers.reduce((a, v) => a + (Number(v) || 0), 0);
  const b = band(total);
  return { total, label: b.label };
}
