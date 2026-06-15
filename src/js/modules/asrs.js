import { bindAutoSave, collectFormData } from '../autobind.js';
import {
  ASRS_TOTAL,
  asrsScreenLabel,
  computeAsrsScores,
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
    t(
      'asrs.q7',
      '¿Con qué frecuencia cometes errores de descuido cuando tienes que trabajar en un proyecto aburrido o difícil?',
    ),
    t(
      'asrs.q8',
      '¿Con qué frecuencia tienes dificultad para mantener la atención cuando haces un trabajo aburrido o repetitivo?',
    ),
    t(
      'asrs.q9',
      '¿Con qué frecuencia tienes dificultad para concentrarte en lo que la gente te dice, incluso cuando te hablan directamente?',
    ),
    t(
      'asrs.q10',
      '¿Con qué frecuencia pierdes cosas o tienes dificultad para encontrarlas en casa o en el trabajo?',
    ),
    t('asrs.q11', '¿Con qué frecuencia te distraes con la actividad o ruido a tu alrededor?'),
    t(
      'asrs.q12',
      '¿Con qué frecuencia te levantas de tu asiento en reuniones u otras situaciones en las que se espera que permanezcas sentado/a?',
    ),
    t('asrs.q13', '¿Con qué frecuencia te sientes inquieto/a o agitado/a?'),
    t(
      'asrs.q14',
      '¿Con qué frecuencia tienes dificultad para relajarte y desconectar cuando tienes tiempo para ti mismo/a?',
    ),
    t(
      'asrs.q15',
      '¿Con qué frecuencia te das cuenta de que hablas demasiado cuando estás en situaciones sociales?',
    ),
    t(
      'asrs.q16',
      'Cuando estás en una conversación, ¿con qué frecuencia terminas las frases de las personas con las que hablas, antes de que ellas terminen?',
    ),
    t(
      'asrs.q17',
      '¿Con qué frecuencia tienes dificultad para esperar tu turno en situaciones en las que hay que hacerlo?',
    ),
    t('asrs.q18', '¿Con qué frecuencia interrumpes a los demás cuando están ocupados?'),
  ];
}

function countAnswered(answers) {
  return answers.filter((v) => v !== null && v !== undefined && v !== '').length;
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
  return Array.from({ length: ASRS_TOTAL }, (_, i) => {
    const v = fd[`q${i}`];
    return v === undefined ? null : Number(v);
  });
}

export async function renderAsrs(host, moduleRow) {
  const data = parseJsonSafe(moduleRow.data, {});
  const answers = Array.isArray(data.answers) ? data.answers : Array(ASRS_TOTAL).fill(null);
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
            <h2 class="module-title" style="margin:0">${escapeHtml(t('asrs.title', 'ASRS v1.1 — TDAH en adultos'))}</h2>
            <p class="module-card-head__sub">${escapeHtml(t('asrs.subtitle', '18 ítems · escala 0–4 · últimos 6 meses · tamizaje WHO (Parte A).'))}</p>
          </div>
          <div class="badge badge--info module-card-head__badge" id="asrs-progress" title="${escapeHtml(t('asrs.progress', 'Ítems respondidos'))}">${answeredCount}/${ASRS_TOTAL}</div>
        </div>

        <div class="psych-scores asrs-scores" id="asrs-scores">
          <div class="psych-score-pill asrs-score-pill ${screenCls}" id="asrs-screen-pill">
            <span class="psych-score-pill__label">${escapeHtml(t('asrs.partA', 'Parte A (tamizaje)'))}</span>
            <strong id="asrs-part-a">${scores.partAAnswered ? `${scores.partAPositive}/6` : '—'}</strong>
            <span id="asrs-screen-label">${escapeHtml(scores.partAAnswered >= 4 ? asrsScreenLabel(scores.screenPositive) : '—')}</span>
          </div>
          <div class="psych-score-pill asrs-score-pill asrs-score-pill--total" id="asrs-total-pill">
            <span class="psych-score-pill__label">${escapeHtml(t('asrs.total', 'Suma total'))}</span>
            <strong id="asrs-total">${scores.total === null ? '—' : scores.total}</strong>
            <span>${escapeHtml(t('asrs.totalMax', 'máx. 72'))}</span>
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
          <p class="asrs-section-label">${escapeHtml(t('asrs.sectionA', 'Parte A — Tamizaje (ítems 1–6)'))}</p>
          ${itemList.slice(0, 6).map((text, idx) => itemRowHtml(idx, text, answers[idx], opts)).join('')}
          <p class="asrs-section-label">${escapeHtml(t('asrs.sectionB', 'Parte B — Síntomas adicionales (ítems 7–18)'))}</p>
          ${itemList.slice(6).map((text, idx) => itemRowHtml(idx + 6, text, answers[idx + 6], opts)).join('')}
        </form>

        <p class="asrs-note">${escapeHtml(t('asrs.note', 'Adult ADHD Self-Report Scale (Kessler et al., WHO). Parte A ≥4 síntomas positivos sugiere tamizaje consistente con TDAH. No sustituye evaluación clínica.'))}</p>
      </div>
    </div>
  `;

  const form = host.querySelector('#asrs-form');
  const progressEl = host.querySelector('#asrs-progress');

  const persist = async () => {
    const next = answersFromForm(form);
    await syncModuleReadableText(moduleRow, { answers: next }, 'completado');
  };
  bindAutoSave(form, persist, workspaceAutoSaveStatus());

  const recomputeLive = () => {
    const next = answersFromForm(form);
    const s = computeAsrsScores(next);
    const answered = countAnswered(next);

    if (progressEl) progressEl.textContent = `${answered}/${ASRS_TOTAL}`;

    const partAEl = host.querySelector('#asrs-part-a');
    const screenLabelEl = host.querySelector('#asrs-screen-label');
    const totalEl = host.querySelector('#asrs-total');
    const screenPill = host.querySelector('#asrs-screen-pill');

    if (partAEl) partAEl.textContent = s.partAAnswered ? `${s.partAPositive}/6` : '—';
    if (screenLabelEl) {
      screenLabelEl.textContent =
        s.partAAnswered >= 4 ? asrsScreenLabel(s.screenPositive) : '—';
    }
    if (totalEl) totalEl.textContent = s.total === null ? '—' : String(s.total);
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
