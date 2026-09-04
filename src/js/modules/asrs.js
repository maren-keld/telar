import { bindAutoSave, collectFormData } from '../autobind.js';
import {
  ASRS_SCREENER_ITEMS,
  asrsScreenLabel,
  computeAsrsScores,
  mergeAsrsScreenerAnswers,
} from '../asrs-scoring.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, parseJsonSafe } from '../utils.js';
import { workspaceAutoSaveStatus } from '../save-status.js';
import { t } from '../i18n.js';

function options() {
  return [
    { v: 0, label: t('asrs.opt0', 'Nunca') },
    { v: 1, label: t('asrs.opt1', 'Raramente') },
    { v: 2, label: t('asrs.opt2', 'A veces') },
    { v: 3, label: t('asrs.opt3', 'A menudo') },
    { v: 4, label: t('asrs.opt4', 'Muy a menudo') },
  ];
}

function items() {
  return [
    t(
      'asrs.q1',
      '¿Con qué frecuencia tienes dificultad para terminar los últimos detalles de un proyecto, una vez que los más difíciles ya están completos?',
    ),
    t(
      'asrs.q2',
      '¿Con qué frecuencia tienes dificultad para poner las cosas en orden cuando tienes que hacer una tarea que requiere organización?',
    ),
    t('asrs.q3', '¿Con qué frecuencia tienes problemas para recordar citas y obligaciones?'),
    t(
      'asrs.q4',
      'Cuando tienes una tarea que requiere mucha concentración, ¿con qué frecuencia evitas o retrasas comenzarla?',
    ),
    t(
      'asrs.q5',
      '¿Con qué frecuencia te mueves inquieto/a o te retuerces las manos o los pies cuando tienes que estar sentado/a por mucho tiempo?',
    ),
    t(
      'asrs.q6',
      '¿Con qué frecuencia te sientes demasiado activo/a y te sientes impulsado/a a hacer cosas, como si estuvieras accionado/a por un motor?',
    ),
  ];
}

function countAnswered(answers) {
  return answers
    .slice(0, ASRS_SCREENER_ITEMS)
    .filter((v) => v !== null && v !== undefined && v !== '').length;
}

function itemRowHtml(idx, text, selected, opts) {
  return `
    <div class="likert-row asrs-row">
      <div class="likert-row__q">
        <span class="likert-row__n">${idx + 1}.</span>
        <span>${escapeHtml(text)}</span>
      </div>
      <div class="likert-row__opts asrs-row__opts" role="radiogroup" aria-label="${escapeHtml(t('asrs.response', 'Respuesta'))} ${idx + 1}">
        ${opts.map((o) => {
          const checked =
            selected !== null && selected !== '' && Number(selected) === o.v ? 'checked' : '';
          return `<label class="likert-opt asrs-opt" title="${escapeHtml(o.label)}">
            <input type="radio" name="q${idx}" value="${o.v}" ${checked} />
            <span class="likert-dot"></span>
            <span class="asrs-opt__label">${escapeHtml(o.label)}</span>
          </label>`;
        }).join('')}
      </div>
    </div>`;
}

function answersFromForm(form) {
  const fd = collectFormData(form);
  return Array.from({ length: ASRS_SCREENER_ITEMS }, (_, i) => {
    const v = fd[`q${i}`];
    return v === undefined ? null : Number(v);
  });
}

export async function renderAsrs(host, moduleRow) {
  const data = parseJsonSafe(moduleRow.data, {});
  const answers = Array.isArray(data.answers) ? data.answers : Array(ASRS_SCREENER_ITEMS).fill(null);
  const scores = computeAsrsScores(answers);
  const answeredCount = countAnswered(answers);
  const opts = options();
  const itemList = items();
  const screenCls = scores.partAAnswered >= 4 && scores.screenPositive ? 'asrs-band--pos' : 'asrs-band--neg';

  host.innerHTML = `
    <div class="card psych-module asrs-module">
      <div class="psych-module__head">
        <div class="module-card-head">
          <div>
            <h2 class="module-title">${escapeHtml(t('asrs.title', 'ASRS v1.1'))}</h2>
            <p class="module-card-head__sub">${escapeHtml(t('asrs.subtitle', '6 ítems · escala 0–4 · últimos 6 meses · screener WHO (Parte A).'))}</p>
          </div>
          <div class="badge badge--info module-card-head__badge" id="asrs-progress" title="${escapeHtml(t('asrs.progress', 'Ítems respondidos'))}">${answeredCount}/${ASRS_SCREENER_ITEMS}</div>
        </div>

        <div class="psych-scores asrs-scores" id="asrs-scores">
          <div class="psych-score-pill asrs-score-pill ${screenCls}" id="asrs-screen-pill">
            <span class="psych-score-pill__label">${escapeHtml(t('asrs.partA', 'Parte A (tamizaje)'))}</span>
            <strong id="asrs-part-a">${scores.partAAnswered ? `${scores.partAPositive}/6` : '—'}</strong>
            <span id="asrs-screen-label">${escapeHtml(scores.partAAnswered >= 4 ? asrsScreenLabel(scores.screenPositive) : '—')}</span>
          </div>
        </div>
      </div>

      <div class="psych-module__scroll">
        <form id="asrs-form" class="likert-form asrs-form">
          <div class="likert-head asrs-head">
            <div class="likert-head__q">${escapeHtml(t('asrs.item', 'Ítem'))}</div>
            <div class="likert-head__opts asrs-head__opts">
              ${opts.map((o) => `<span title="${escapeHtml(o.label)}">${escapeHtml(o.label)}</span>`).join('')}
            </div>
          </div>
          ${itemList.map((text, idx) => itemRowHtml(idx, text, answers[idx], opts)).join('')}
        </form>

        <p class="asrs-note">${escapeHtml(t('asrs.note', 'Adult ADHD Self-Report Scale (ASRS-v1.1) Screener © World Health Organization. Uso con atribución; no se requiere aprobación previa para el screener de 6 ítems. Parte A ≥4 síntomas positivos sugiere tamizaje consistente con TDAH. No sustituye evaluación clínica.'))}</p>
      </div>
    </div>
  `;

  const form = host.querySelector('#asrs-form');
  const progressEl = host.querySelector('#asrs-progress');

  const persist = async () => {
    const next = mergeAsrsScreenerAnswers(answersFromForm(form), answers);
    await syncModuleReadableText(moduleRow, { answers: next }, 'completado');
  };
  bindAutoSave(form, persist, workspaceAutoSaveStatus());

  const recomputeLive = () => {
    const next = mergeAsrsScreenerAnswers(answersFromForm(form), answers);
    const s = computeAsrsScores(next);
    const answered = countAnswered(next);

    if (progressEl) progressEl.textContent = `${answered}/${ASRS_SCREENER_ITEMS}`;

    const partAEl = host.querySelector('#asrs-part-a');
    const screenLabelEl = host.querySelector('#asrs-screen-label');
    const screenPill = host.querySelector('#asrs-screen-pill');

    if (partAEl) partAEl.textContent = s.partAAnswered ? `${s.partAPositive}/6` : '—';
    if (screenLabelEl) {
      screenLabelEl.textContent =
        s.partAAnswered >= 4 ? asrsScreenLabel(s.screenPositive) : '—';
    }
    if (screenPill) {
      const cls =
        s.partAAnswered >= 4 && s.screenPositive ? 'asrs-band--pos' : 'asrs-band--neg';
      screenPill.className = `psych-score-pill asrs-score-pill ${cls}`;
    }
  };

  form.addEventListener('change', recomputeLive);
  form.addEventListener('input', recomputeLive);
}

export { asrsSummary } from '../asrs-scoring.js';

/** Definición de ítems y anclajes para el schema declarativo (compartir por enlace). */
export { items as asrsItems, options as asrsOptions };
