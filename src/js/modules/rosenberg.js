import { bindAutoSave, collectFormData } from '../autobind.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, parseJsonSafe } from '../utils.js';
import { workspaceAutoSaveStatus } from '../save-status.js';

const OPTIONS = [
  { v: 1, label: 'Muy en desacuerdo' },
  { v: 2, label: 'En desacuerdo' },
  { v: 3, label: 'De acuerdo' },
  { v: 4, label: 'Muy de acuerdo' },
];

/**
 * 10 ítems de la Escala de Autoestima de Rosenberg (EAR).
 * Los ítems negativos se invierten antes de sumar (score = 5 − respuesta).
 */
const ITEMS = [
  { text: 'Me siento una persona de valor, al menos en igual medida que los demás.', reverse: false },
  { text: 'Creo que tengo buenas cualidades.', reverse: false },
  { text: 'En general, me inclino a pensar que soy un/a fracasado/a.', reverse: true },
  { text: 'Soy capaz de hacer las cosas tan bien como la mayoría de la gente.', reverse: false },
  { text: 'Creo que no tengo muchos motivos para sentirme orgulloso/a de mí mismo/a.', reverse: true },
  { text: 'Tengo una actitud positiva hacia mí mismo/a.', reverse: false },
  { text: 'En general, estoy satisfecho/a conmigo mismo/a.', reverse: false },
  { text: 'Desearía valorarme más a mí mismo/a.', reverse: true },
  { text: 'A veces me siento verdaderamente inútil.', reverse: true },
  { text: 'A veces pienso que no soy bueno/a para nada.', reverse: true },
];

const TOTAL = ITEMS.length;

/** Ítems negativos (índice base-0): 2, 4, 7, 8, 9 */
function scoredValue(itemIdx, rawValue) {
  if (rawValue === null || rawValue === undefined || rawValue === '') return null;
  const v = Number(rawValue);
  return ITEMS[itemIdx].reverse ? 5 - v : v;
}

function computeTotal(answers) {
  let sum = 0;
  let any = false;
  for (let i = 0; i < TOTAL; i++) {
    const s = scoredValue(i, answers[i]);
    if (s === null) continue;
    sum += s;
    any = true;
  }
  return any ? sum : null;
}

function allAnswered(answers) {
  return countAnswered(answers) === TOTAL;
}

function countAnswered(answers) {
  return answers.filter((v) => v !== null && v !== undefined && v !== '').length;
}

const BANDS = [
  { label: 'Autoestima baja',  min: 10, max: 25, cls: 'rsb-band--low'  },
  { label: 'Autoestima media', min: 26, max: 29, cls: 'rsb-band--mid'  },
  { label: 'Autoestima alta',  min: 30, max: 40, cls: 'rsb-band--high' },
];

function band(total, answers) {
  if (total === null) return { label: '—', cls: '' };
  if (!allAnswered(answers)) {
    return { label: 'Parcial', cls: 'rsb-band--partial' };
  }
  return BANDS.find((b) => total >= b.min && total <= b.max) || BANDS[0];
}

function scorePillHtml(total, { label, cls }) {
  return `
    <div class="psych-score-pill rsb-score-pill ${cls}" id="rsb-pill">
      <span class="psych-score-pill__label">Puntuación total</span>
      <strong id="rsb-score">${total === null ? '—' : total}</strong>
      <span id="rsb-label">${escapeHtml(label)}</span>
    </div>
    <div class="rsb-interpretation" id="rsb-interp">
      ${interpretationHtml(total, label)}
    </div>`;
}

function interpretationHtml(total, label) {
  if (total === null) return '';
  const map = {
    'Autoestima baja':
      'Presencia de malestar significativo con la autovaloración. Se recomienda explorar áreas de autocrítica, historia de logros y vínculos protectores.',
    'Autoestima media':
      'Autovaloración moderada con cierta variabilidad. La persona puede beneficiarse de trabajo en el reconocimiento de sus recursos personales.',
    'Autoestima alta':
      'Autovaloración positiva y estable. Constituye un factor protector relevante para el proceso terapéutico.',
  };
  return `<p class="rsb-interp-text">${escapeHtml(map[label] || '')}</p>`;
}

function itemRowHtml(idx, item, selected) {
  const reversedNote = item.reverse
    ? '<span class="rsb-reversed-badge" title="Ítem con puntuación invertida">R</span>'
    : '';
  return `
    <div class="likert-row">
      <div class="likert-row__q">
        <span class="likert-row__n">${idx + 1}.</span>
        <span>${escapeHtml(item.text)}${reversedNote}</span>
      </div>
      <div class="likert-row__opts" role="radiogroup" aria-label="Respuesta ${idx + 1}">
        ${OPTIONS.map((o) => {
          const checked =
            selected !== null && selected !== '' && Number(selected) === o.v ? 'checked' : '';
          return `<label class="likert-opt" title="${escapeHtml(o.label)}">
            <input type="radio" name="q${idx}" value="${o.v}" ${checked} />
            <span class="likert-dot"></span>
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

export async function renderRosenberg(host, moduleRow) {
  const data = parseJsonSafe(moduleRow.data, {});
  const answers = Array.isArray(data.answers) ? data.answers : Array(TOTAL).fill(null);
  const total = computeTotal(answers);
  const b = band(total, answers);
  const answeredCount = countAnswered(answers);

  host.innerHTML = `
    <div class="card psych-module rsb-module">
      <div class="psych-module__head">
        <div class="module-card-head">
          <div>
            <h2 class="module-title" style="margin:0">Escala de Autoestima de Rosenberg (EAR)</h2>
            <p class="module-card-head__sub">
              10 ítems · escala 1–4 · la puntuación se actualiza al responder.
            </p>
          </div>
          <div class="badge badge--info module-card-head__badge" id="rsb-progress" title="Ítems respondidos / Total">${answeredCount}/${TOTAL}</div>
        </div>

        <div class="psych-scores rsb-scores" id="rsb-scores">
          ${scorePillHtml(total, b)}
        </div>
      </div>

      <div class="psych-module__scroll">
        <form id="rsb-form" class="likert-form">
          <div class="likert-head">
            <div class="likert-head__q">Reactivo</div>
            <div class="likert-head__opts">
              ${OPTIONS.map((o) => `<span title="${escapeHtml(o.label)}">${escapeHtml(o.label)}</span>`).join('')}
            </div>
          </div>
          ${ITEMS.map((item, idx) => itemRowHtml(idx, item, answers[idx])).join('')}
        </form>

        <p class="rsb-note">
          Los ítems marcados con <span class="rsb-reversed-badge">R</span> tienen puntuación invertida
          y se corrigen automáticamente en el cálculo del total.
        </p>
      </div>
    </div>
  `;

  const form = host.querySelector('#rsb-form');
  const progressEl = host.querySelector('#rsb-progress');

  const persist = async () => {
    const next = answersFromForm(form);
    await syncModuleReadableText(moduleRow, { answers: next }, 'completado');
  };
  bindAutoSave(form, persist, workspaceAutoSaveStatus());

  const recomputeLive = () => {
    const next = answersFromForm(form);
    const t = computeTotal(next);
    const bNext = band(t, next);
    const answered = countAnswered(next);

    if (progressEl) progressEl.textContent = `${answered}/${TOTAL}`;

    const pill = host.querySelector('#rsb-pill');
    const scoreEl = host.querySelector('#rsb-score');
    const labelEl = host.querySelector('#rsb-label');
    const interpEl = host.querySelector('#rsb-interp');

    if (scoreEl) scoreEl.textContent = t === null ? '—' : String(t);
    if (labelEl) labelEl.textContent = bNext.label;
    if (pill) pill.className = `psych-score-pill rsb-score-pill ${bNext.cls}`;
    if (interpEl) interpEl.innerHTML = interpretationHtml(t, bNext.label);
  };

  form.addEventListener('change', recomputeLive);
  form.addEventListener('input', recomputeLive);
}
