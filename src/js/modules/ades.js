import { bindAutoSave, collectFormData } from '../autobind.js';
import {
  ADES_TOTAL,
  adesScreenLabel,
  adesSeverityLabel,
  computeAdesScores,
} from '../ades-scoring.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, parseJsonSafe } from '../utils.js';
import { workspaceAutoSaveStatus } from '../save-status.js';
import { t } from '../i18n.js';

function items() {
  return [
    t(
      'ades.q1',
      'Me absorbo tanto viendo TV, leyendo o jugando un videojuego que no me doy cuenta de lo que pasa a mi alrededor.',
    ),
    t('ades.q2', 'Me devuelven exámenes o tareas que no recuerdo haber hecho.'),
    t('ades.q3', 'Tengo sentimientos intensos que no parecen ser míos.'),
    t('ades.q4', 'A veces hago algo muy bien y otras veces no puedo hacerlo en absoluto.'),
    t('ades.q5', 'Me dicen que hago o digo cosas que no recuerdo haber hecho o dicho.'),
    t('ades.q6', 'Me siento como en una niebla o desconectado/a y las cosas a mi alrededor parecen irreales.'),
    t('ades.q7', 'Me confundo sobre si hice algo o solo pensé en hacerlo.'),
    t('ades.q8', 'Miro el reloj y me doy cuenta de que pasó el tiempo y no recuerdo qué pasó.'),
    t('ades.q9', 'Escucho voces en mi cabeza que no son mías.'),
    t('ades.q10', 'Cuando estoy en un lugar donde no quiero estar, puedo irme en mi mente.'),
    t('ades.q11', 'Soy tan bueno/a mintiendo y actuando que yo mismo/a me lo creo.'),
    t('ades.q12', 'Me descubro "despertando" en medio de hacer algo.'),
    t('ades.q13', 'No me reconozco en el espejo.'),
    t('ades.q14', 'Me encuentro yendo a algún lugar o haciendo algo y no sé por qué.'),
    t('ades.q15', 'Me encuentro en algún lugar y no recuerdo cómo llegué.'),
    t('ades.q16', 'Tengo pensamientos que realmente no parecen pertenecerme.'),
    t('ades.q17', 'Descubro que puedo hacer desaparecer el dolor físico.'),
    t(
      'ades.q18',
      'No puedo distinguir si las cosas realmente pasaron o si solo las soñé o pensé.',
    ),
    t('ades.q19', 'Me encuentro haciendo algo que sé que está mal, aunque realmente no quiero hacerlo.'),
    t('ades.q20', 'Me dicen que a veces actúo tan diferente que parezco otra persona.'),
    t('ades.q21', 'Siento que hay paredes dentro de mi mente.'),
    t('ades.q22', 'Encuentro escritos, dibujos o cartas que debí haber hecho pero no recuerdo haberlos hecho.'),
    t('ades.q23', 'Algo dentro de mí parece hacerme hacer cosas que no quiero hacer.'),
    t(
      'ades.q24',
      'Descubro que no puedo saber si solo estoy recordando algo o si realmente me está pasando.',
    ),
    t('ades.q25', 'Me encuentro fuera de mi cuerpo, observándome como si fuera otra persona.'),
    t('ades.q26', 'Mis relaciones con familia y amigos cambian de repente y no sé por qué.'),
    t('ades.q27', 'Siento que mi pasado es un rompecabezas y faltan algunas piezas.'),
    t('ades.q28', 'Me absorbo tanto en mis juguetes o peluches que parecen estar vivos.'),
    t('ades.q29', 'Siento que hay personas diferentes dentro de mí.'),
    t('ades.q30', 'Siento que mi cuerpo no me pertenece.'),
  ];
}

function countAnswered(answers) {
  return answers.filter((v) => v !== null && v !== undefined && v !== '').length;
}

function itemRowHtml(idx, text, selected) {
  const val = selected === null || selected === '' ? 0 : Number(selected);
  return `
    <div class="ades-row">
      <div class="ades-row__q">
        <span class="ades-row__n">${idx + 1}.</span>
        <span>${escapeHtml(text)}</span>
      </div>
      <div class="ades-row__ctrl">
        <input type="range" name="q${idx}" min="0" max="10" step="1" value="${val}" aria-label="${escapeHtml(t('ades.response', 'Respuesta'))} ${idx + 1}" />
        <output class="ades-row__val">${val}</output>
      </div>
    </div>`;
}

function answersFromForm(form) {
  const fd = collectFormData(form);
  return Array.from({ length: ADES_TOTAL }, (_, i) => {
    const v = fd[`q${i}`];
    return v === undefined || v === '' ? null : Number(v);
  });
}

function fmtMean(v) {
  if (v == null) return '—';
  return v.toFixed(1);
}

export async function renderAdes(host, moduleRow) {
  const data = parseJsonSafe(moduleRow.data, {});
  const answers = Array.isArray(data.answers) ? data.answers : Array(ADES_TOTAL).fill(null);
  const scores = computeAdesScores(answers);
  const answeredCount = countAnswered(answers);
  const itemList = items();
  const screenCls = scores.complete && scores.elevated ? 'ades-band--pos' : 'ades-band--neg';

  host.innerHTML = `
    <div class="card psych-module ades-module">
      <div class="psych-module__head">
        <div class="module-card-head">
          <div>
            <h2 class="module-title" style="margin:0">${escapeHtml(t('ades.title', 'A-DES — Disociación adolescente'))}</h2>
            <p class="module-card-head__sub">${escapeHtml(t('ades.subtitle', '30 ítems · escala 0–10 (nunca → siempre) · 10–21 años · dominio público.'))}</p>
          </div>
          <div class="badge badge--info module-card-head__badge" id="ades-progress" title="${escapeHtml(t('ades.progress', 'Ítems respondidos'))}">${answeredCount}/${ADES_TOTAL}</div>
        </div>
        <div class="psych-scores ades-scores" id="ades-scores">
          <div class="psych-score-pill ades-score-pill ${screenCls}" id="ades-pill">
            <span class="psych-score-pill__label">${escapeHtml(t('ades.mean', 'Media total'))}</span>
            <strong id="ades-score">${fmtMean(scores.mean)}</strong>
            <span id="ades-label">${escapeHtml(scores.complete ? adesScreenLabel(scores.elevated) : '—')}</span>
          </div>
          <div class="psych-score-pill ades-score-pill ades-score-pill--sub">
            <span class="psych-score-pill__label">${escapeHtml(t('ades.severity', 'Nivel'))}</span>
            <strong id="ades-severity">${escapeHtml(scores.complete ? adesSeverityLabel(scores.mean) : '—')}</strong>
          </div>
          <div class="psych-score-pill ades-score-pill ades-score-pill--sub">
            <span class="psych-score-pill__label">${escapeHtml(t('ades.taxon', 'A-DES-T (8 ítems)'))}</span>
            <strong id="ades-taxon">${fmtMean(scores.taxonMean)}</strong>
          </div>
        </div>
        <p class="ades-scale-hint">${escapeHtml(t('ades.scaleHint', '0 = nunca · 10 = siempre (sin alcohol ni drogas).'))}</p>
      </div>
      <div class="psych-module__scroll">
        <form id="ades-form" class="ades-form">
          ${itemList.map((text, i) => itemRowHtml(i, text, answers[i])).join('')}
        </form>
        <p class="ades-note">${escapeHtml(t('ades.note', 'A-DES (Armstrong, Putnam & Carlson). Tamizaje de disociación en adolescentes; no es diagnóstico. Media ≥4 sugiere evaluación clínica adicional.'))}</p>
      </div>
    </div>`;

  const form = host.querySelector('#ades-form');
  const progressEl = host.querySelector('#ades-progress');

  form.querySelectorAll('input[type="range"]').forEach((input) => {
    input.addEventListener('input', () => {
      const out = input.parentElement?.querySelector('.ades-row__val');
      if (out) out.textContent = input.value;
    });
  });

  const refreshScores = (s) => {
    const scoreEl = host.querySelector('#ades-score');
    const labelEl = host.querySelector('#ades-label');
    const severityEl = host.querySelector('#ades-severity');
    const taxonEl = host.querySelector('#ades-taxon');
    const pill = host.querySelector('#ades-pill');
    if (scoreEl) scoreEl.textContent = fmtMean(s.mean);
    if (labelEl) labelEl.textContent = s.complete ? adesScreenLabel(s.elevated) : '—';
    if (severityEl) severityEl.textContent = s.complete ? adesSeverityLabel(s.mean) : '—';
    if (taxonEl) taxonEl.textContent = fmtMean(s.taxonMean);
    if (pill) {
      const cls = s.complete && s.elevated ? 'ades-band--pos' : 'ades-band--neg';
      pill.className = `psych-score-pill ades-score-pill ${cls}`;
    }
    if (progressEl) progressEl.textContent = `${s.answered}/${ADES_TOTAL}`;
  };

  const persist = async () => {
    const nextAnswers = answersFromForm(form);
    const s = computeAdesScores(nextAnswers);
    refreshScores(s);
    const status = s.complete ? 'completado' : s.answered ? 'en_progreso' : 'pendiente';
    await syncModuleReadableText(moduleRow, { answers: nextAnswers }, status);
  };

  bindAutoSave(form, persist, workspaceAutoSaveStatus());
}

export { adesSummary } from '../ades-scoring.js';
