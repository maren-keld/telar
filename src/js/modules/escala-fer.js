import { bindAutoSave, collectFormData } from '../autobind.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, parseJsonSafe } from '../utils.js';
import { workspaceAutoSaveStatus } from '../save-status.js';

const OPTIONS = [
  { v: 0, label: 'Nunca' },
  { v: 1, label: 'Rara vez' },
  { v: 2, label: 'A veces' },
  { v: 3, label: 'A menudo' },
  { v: 4, label: 'Siempre' },
];

const FORTALEZAS = [
  'Tengo personas cercanas a quienes recurrir cuando lo necesito.',
  'Puedo identificar mis emociones y hablar de ellas.',
  'Cuento con rutinas o hábitos que me ayudan a mantenerme estable.',
  'Tengo proyectos o metas que me dan sentido.',
  'Me siento capaz de afrontar los problemas que aparecen en mi vida.',
  'Puedo pedir ayuda cuando la necesito.',
];

const RIESGOS = [
  'He tenido pensamientos de hacerme daño o de que preferiría no estar aquí.',
  'Consumo alcohol u otras sustancias para aliviar el malestar emocional.',
  'He vivido situaciones de violencia o abuso en el último tiempo.',
  'Me siento aislado/a o sin nadie que me comprenda.',
  'Tengo dificultades importantes para dormir, comer o funcionar en el día a día.',
  'Siento que mi situación actual está completamente fuera de mi control.',
];

const RISK_ALERT_IDX = 0; // ideación de daño

function answerAt(answers, i) {
  const v = answers[i];
  if (v === null || v === undefined || v === '') return null;
  return Number(v);
}

function sumSection(answers, offset, count) {
  let total = 0;
  for (let i = 0; i < count; i++) {
    const v = answerAt(answers, offset + i);
    total += v === null ? 0 : v;
  }
  return total;
}

function countAnswered(answers) {
  return answers.filter((v) => v !== null && v !== undefined && v !== '').length;
}

const STRENGTH_BANDS = [
  { label: 'Recursos limitados', min: 0, max: 8, cls: 'fer-sev--low' },
  { label: 'Recursos moderados', min: 9, max: 14, cls: 'fer-sev--mid' },
  { label: 'Buenos recursos', min: 15, max: 19, cls: 'fer-sev--good' },
  { label: 'Recursos sólidos', min: 20, max: 24, cls: 'fer-sev--strong' },
];

const RISK_BANDS = [
  { label: 'Riesgo bajo', min: 0, max: 6, cls: 'fer-sev--safe' },
  { label: 'Riesgo moderado', min: 7, max: 12, cls: 'fer-sev--mid' },
  { label: 'Riesgo alto', min: 13, max: 18, cls: 'fer-sev--high' },
  { label: 'Riesgo muy alto', min: 19, max: 24, cls: 'fer-sev--critical' },
];

function band(score, bands) {
  return bands.find((b) => score >= b.min && score <= b.max) || bands[bands.length - 1];
}

function scorePillHtml(id, dimLabel, score, { label, cls }) {
  return `
    <div class="psych-score-pill fer-score-pill ${cls}" id="${id}-pill">
      <span class="psych-score-pill__label">${escapeHtml(dimLabel)}</span>
      <strong id="${id}-score">${score}</strong>
      <span id="${id}-label">${escapeHtml(label)}</span>
    </div>`;
}

function alertBannerHtml(show) {
  return `
    <div class="fer-alert" id="fer-alert" ${show ? '' : 'hidden'}>
      <strong>Alerta clínica:</strong> La persona reporta pensamientos de hacerse daño.
      Evalúa riesgo suicida de forma directa.
    </div>`;
}

function itemRowHtml(idx, text, selected, isRisk) {
  const sectionCls = isRisk ? 'fer-row--risk' : 'fer-row--strength';
  return `
    <div class="fer-row ${sectionCls}">
      <div class="fer-row__q">
        <span class="fer-row__n">${idx + 1}.</span>
        <span>${escapeHtml(text)}</span>
      </div>
      <div class="fer-row__opts" role="radiogroup" aria-label="Respuesta ${idx + 1}">
        ${OPTIONS.map((o) => {
          const checked =
            selected !== null && selected !== '' && Number(selected) === o.v ? 'checked' : '';
          return `<label class="fer-opt" title="${escapeHtml(o.label)}">
            <input type="radio" name="q${idx}" value="${o.v}" ${checked} />
            <span class="fer-dot"></span>
          </label>`;
        }).join('')}
      </div>
    </div>`;
}

function answersFromForm(form) {
  const fd = collectFormData(form);
  const total = FORTALEZAS.length + RIESGOS.length;
  return Array.from({ length: total }, (_, i) => {
    const v = fd[`q${i}`];
    return v === undefined ? null : Number(v);
  });
}

export async function renderEscalaFer(host, moduleRow) {
  const data = parseJsonSafe(moduleRow.data, {});
  const TOTAL = FORTALEZAS.length + RIESGOS.length;
  const answers = Array.isArray(data.answers) ? data.answers : Array(TOTAL).fill(null);

  const strScore = sumSection(answers, 0, FORTALEZAS.length);
  const riskScore = sumSection(answers, FORTALEZAS.length, RIESGOS.length);
  const answeredCount = countAnswered(answers);

  const riskAlertAnswer = answerAt(answers, FORTALEZAS.length + RISK_ALERT_IDX);
  const showAlert = riskAlertAnswer !== null && riskAlertAnswer >= 2;

  host.innerHTML = `
    <div class="card psych-module fer-module">
      <div class="psych-module__head">
        <div class="module-card-head">
          <div>
            <h2 class="module-title" style="margin:0">Escala de Fortalezas y Riesgos (EFR)</h2>
            <p class="module-card-head__sub">
              Situación actual del paciente · Selecciona una opción por ítem.
            </p>
          </div>
          <div class="badge badge--info module-card-head__badge" id="fer-progress" title="Respondidas / Total">${answeredCount}/${TOTAL}</div>
        </div>

        <div class="psych-scores fer-scores" id="fer-scores">
          ${scorePillHtml('fer-str', 'Fortalezas', strScore, band(strScore, STRENGTH_BANDS))}
          ${scorePillHtml('fer-risk', 'Riesgos', riskScore, band(riskScore, RISK_BANDS))}
        </div>

        ${alertBannerHtml(showAlert)}
      </div>

      <div class="psych-module__scroll">
        <form id="fer-form" class="fer-form">
          <div class="fer-head">
            <div class="fer-head__q"></div>
            <div class="fer-head__opts">
              ${OPTIONS.map((o) => `<span>${escapeHtml(o.label)}</span>`).join('')}
            </div>
          </div>

          <div class="fer-section-label">Fortalezas</div>
          ${FORTALEZAS.map((text, i) => itemRowHtml(i, text, answers[i], false)).join('')}

          <div class="fer-section-label fer-section-label--risk">Riesgos</div>
          ${RIESGOS.map((text, i) =>
            itemRowHtml(FORTALEZAS.length + i, text, answers[FORTALEZAS.length + i], true),
          ).join('')}
        </form>
      </div>
    </div>
  `;

  const form = host.querySelector('#fer-form');
  const progressEl = host.querySelector('#fer-progress');
  const scoresEl = host.querySelector('#fer-scores');
  const alertEl = host.querySelector('#fer-alert');

  const persist = async () => {
    const next = answersFromForm(form);
    await syncModuleReadableText(moduleRow, { answers: next }, 'completado');
  };

  bindAutoSave(form, persist, workspaceAutoSaveStatus());

  const recomputeLive = () => {
    const next = answersFromForm(form);
    const str = sumSection(next, 0, FORTALEZAS.length);
    const risk = sumSection(next, FORTALEZAS.length, RIESGOS.length);
    const answered = countAnswered(next);

    if (progressEl) progressEl.textContent = `${answered}/${TOTAL}`;

    updatePill('fer-str', str, band(str, STRENGTH_BANDS));
    updatePill('fer-risk', risk, band(risk, RISK_BANDS));

    const riskAlert = answerAt(next, FORTALEZAS.length + RISK_ALERT_IDX);
    if (alertEl) alertEl.hidden = !(riskAlert !== null && riskAlert >= 2);
  };

  form.addEventListener('change', recomputeLive);
  form.addEventListener('input', recomputeLive);
  recomputeLive();
}

function updatePill(id, score, { label, cls }) {
  const pill = document.getElementById(`${id}-pill`);
  const scoreEl = document.getElementById(`${id}-score`);
  const labelEl = document.getElementById(`${id}-label`);
  if (pill) {
    pill.className = pill.className.replace(/fer-sev--\S+/g, '').trim() + ` ${cls}`;
  }
  if (scoreEl) scoreEl.textContent = String(score);
  if (labelEl) labelEl.textContent = label;
}
