import { bindAutoSave, collectFormData } from '../autobind.js';
import {
  SPRINT_LIKERT_COUNT,
  SPRINT_TOTAL_ITEMS,
  computeSprintScores,
  sprintScreenLabel,
} from '../sprint-scoring.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, parseJsonSafe } from '../utils.js';
import { workspaceAutoSaveStatus } from '../save-status.js';
import { t } from '../i18n.js';

function likertOptions() {
  return [
    { v: 0, label: t('sprint.opt0', 'Nada') },
    { v: 1, label: t('sprint.opt1', 'Un poco') },
    { v: 2, label: t('sprint.opt2', 'Moderadamente') },
    { v: 3, label: t('sprint.opt3', 'Bastante') },
    { v: 4, label: t('sprint.opt4', 'Mucho') },
  ];
}

function likertItems() {
  return [
    t('sprint.q1', '¿Cuánto le han molestado los recuerdos no deseados o pesadillas de lo que pasó?'),
    t(
      'sprint.q2',
      '¿Cuánto esfuerzo ha hecho para evitar pensar o hablar sobre lo sucedido o realizar actos que le recuerden lo sucedido?',
    ),
    t(
      'sprint.q3',
      '¿Hasta qué punto ha perdido el placer por las cosas, se mantiene distante de la gente, o le ha sido difícil experimentar sentimientos a consecuencia de lo sucedido?',
    ),
    t(
      'sprint.q4',
      '¿Cuánto le han incomodado problemas de sueño, concentración, nerviosismo, irritabilidad o sentirse muy alerta de lo que le rodea a consecuencia de lo sucedido?',
    ),
    t('sprint.q5', '¿Qué tan desanimado/a o deprimido/a se ha sentido a consecuencia de lo sucedido?'),
    t(
      'sprint.q6',
      '¿Considera que su habilidad para manejar otras situaciones o eventos estresantes se ha visto dañada?',
    ),
    t(
      'sprint.q7',
      '¿Considera que sus reacciones interfieren con el cuidado de su salud física? (p. ej. alimentación, descanso, sustancias)',
    ),
    t('sprint.q8', '¿Qué tan estresado/a o incómodo/a se siente con respecto a sus reacciones?'),
    t(
      'sprint.q9',
      '¿Qué tanto han interferido sus reacciones con su habilidad para trabajar o llevar a cabo actividades diarias?',
    ),
    t(
      'sprint.q10',
      '¿Qué tan afectadas se han visto sus relaciones familiares o de amistad, o sus actividades sociales y recreativas?',
    ),
    t(
      'sprint.q11',
      '¿Qué tan preocupado/a se ha sentido acerca de su habilidad para vencer problemas que podría enfrentar sin mayor asistencia?',
    ),
  ];
}

function likertHeadHtml(opts) {
  const short = ['Nada', 'Poco', 'Mod.', 'Bast.', 'Ext.'];
  return opts
    .map((o, i) => `<span class="likert-head__opt" title="${escapeHtml(o.label)}">${escapeHtml(short[i] || o.label)}</span>`)
    .join('');
}

function countAnswered(answers) {
  return answers.filter((v) => v !== null && v !== undefined && v !== '').length;
}

function likertRowHtml(idx, text, selected, opts) {
  return `
    <div class="likert-row sprint-row">
      <div class="likert-row__q">
        <span class="likert-row__n">${idx + 1}.</span>
        <span>${escapeHtml(text)}</span>
      </div>
      <div class="likert-row__opts sprint-row__opts" role="radiogroup" aria-label="${escapeHtml(t('sprint.response', 'Respuesta'))} ${idx + 1}">
        ${opts
          .map((o) => {
            const checked =
              selected !== null && selected !== '' && Number(selected) === o.v ? 'checked' : '';
            return `<label class="likert-opt sprint-opt" title="${escapeHtml(o.label)}">
            <input type="radio" name="q${idx}" value="${o.v}" ${checked} />
            <span class="likert-dot"></span>
          </label>`;
          })
          .join('')}
      </div>
    </div>`;
}

function suicideRowHtml(selected) {
  return `
    <div class="sprint-suicide-row">
      <p class="sprint-suicide-row__q">
        <span class="likert-row__n">12.</span>
        ${escapeHtml(t('sprint.q12', '¿Hay alguna posibilidad de que usted tenga deseos de herirse o suicidarse?'))}
      </p>
      <div class="sprint-suicide-row__opts" role="radiogroup">
        <label class="sprint-suicide-opt">
          <input type="radio" name="q11" value="0" ${selected === 0 || selected === '0' ? 'checked' : ''} />
          ${escapeHtml(t('sprint.no', 'No'))}
        </label>
        <label class="sprint-suicide-opt sprint-suicide-opt--yes">
          <input type="radio" name="q11" value="1" ${selected === 1 || selected === '1' ? 'checked' : ''} />
          ${escapeHtml(t('sprint.yes', 'Sí'))}
        </label>
      </div>
      <p class="sprint-suicide-hint">${escapeHtml(t('sprint.q12hint', 'Este ítem no suma al puntaje; activa alerta clínica si responde Sí.'))}</p>
    </div>`;
}

function answersFromForm(form) {
  const fd = collectFormData(form);
  return Array.from({ length: SPRINT_TOTAL_ITEMS }, (_, i) => {
    const v = fd[`q${i}`];
    return v === undefined ? null : Number(v);
  });
}

export async function renderSprintEcl(host, moduleRow) {
  const data = parseJsonSafe(moduleRow.data, {});
  const answers = Array.isArray(data.answers) ? data.answers : Array(SPRINT_TOTAL_ITEMS).fill(null);
  const scores = computeSprintScores(answers);
  const answeredCount = countAnswered(answers.slice(0, SPRINT_LIKERT_COUNT));
  const opts = likertOptions();
  const itemList = likertItems();
  const screenCls = scores.complete && scores.elevated ? 'sprint-band--pos' : 'sprint-band--neg';
  const suicideCls = scores.suicideRisk ? 'sprint-alert--on' : '';

  host.innerHTML = `
    <div class="card psych-module sprint-module">
      <div class="psych-module__head">
        <div class="module-card-head">
          <div>
            <h2 class="module-title" style="margin:0">${escapeHtml(t('sprint.title', 'SPRINT-E-CL — Trauma breve'))}</h2>
            <p class="module-card-head__sub">${escapeHtml(t('sprint.subtitle', '12 ítems · escala 0–4 · validación Chile (27-F) · una vez por sesión.'))}</p>
          </div>
          <div class="badge badge--info module-card-head__badge" id="sprint-progress" title="${escapeHtml(t('sprint.progress', 'Ítems respondidos'))}">${answeredCount}/${SPRINT_LIKERT_COUNT}</div>
        </div>

        <div class="psych-scores sprint-scores" id="sprint-scores">
          <div class="psych-score-pill sprint-score-pill ${screenCls}" id="sprint-pill">
            <span class="psych-score-pill__label">${escapeHtml(t('sprint.total', 'Suma (ítems 1–11)'))}</span>
            <strong id="sprint-score">${scores.total === null ? '—' : scores.total}</strong>
            <span id="sprint-label">${escapeHtml(scores.complete ? sprintScreenLabel(scores.elevated) : '—')}</span>
          </div>
          <div class="psych-score-pill sprint-score-pill sprint-score-pill--alert ${suicideCls}" id="sprint-suicide-pill" hidden>
            <span class="psych-score-pill__label">${escapeHtml(t('sprint.suicideAlert', 'Ideación suicida'))}</span>
            <strong>${escapeHtml(t('sprint.suicideYes', 'Derivar / evaluar'))}</strong>
          </div>
        </div>
      </div>

      <div class="psych-module__scroll">
        <form id="sprint-form" class="likert-form sprint-form">
          <div class="likert-head sprint-head">
            <div class="likert-head__q">${escapeHtml(t('sprint.item', 'Ítem'))}</div>
            <div class="likert-head__opts sprint-head__opts">
              ${likertHeadHtml(opts)}
            </div>
          </div>
          ${itemList.map((text, idx) => likertRowHtml(idx, text, answers[idx], opts)).join('')}
          ${suicideRowHtml(answers[11])}
        </form>

        <p class="sprint-note">${escapeHtml(t('sprint.note', 'SPRINT-E (Norris et al.; validación chilena Leiva-Bianchi & Gallardo, 2013). No sustituye evaluación clínica integral.'))}</p>
      </div>
    </div>
  `;

  const form = host.querySelector('#sprint-form');
  const progressEl = host.querySelector('#sprint-progress');
  const suicidePill = host.querySelector('#sprint-suicide-pill');
  if (suicidePill) suicidePill.hidden = !scores.suicideRisk;

  const persist = async () => {
    const next = answersFromForm(form);
    await syncModuleReadableText(moduleRow, { answers: next }, 'completado');
  };
  bindAutoSave(form, persist, workspaceAutoSaveStatus());

  const recomputeLive = () => {
    const next = answersFromForm(form);
    const s = computeSprintScores(next);
    const answered = countAnswered(next.slice(0, SPRINT_LIKERT_COUNT));

    if (progressEl) progressEl.textContent = `${answered}/${SPRINT_LIKERT_COUNT}`;

    const scoreEl = host.querySelector('#sprint-score');
    const labelEl = host.querySelector('#sprint-label');
    const pill = host.querySelector('#sprint-pill');

    if (scoreEl) scoreEl.textContent = s.total === null ? '—' : String(s.total);
    if (labelEl) labelEl.textContent = s.complete ? sprintScreenLabel(s.elevated) : '—';
    if (pill) {
      const cls = s.complete && s.elevated ? 'sprint-band--pos' : 'sprint-band--neg';
      pill.className = `psych-score-pill sprint-score-pill ${cls}`;
    }
    if (suicidePill) suicidePill.hidden = !s.suicideRisk;
  };

  form.addEventListener('change', recomputeLive);
  form.addEventListener('input', recomputeLive);
}

export { sprintSummary } from '../sprint-scoring.js';
