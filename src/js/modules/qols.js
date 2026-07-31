import { bindAutoSave, collectFormData } from '../autobind.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, parseJsonSafe } from '../utils.js';
import { workspaceAutoSaveStatus } from '../save-status.js';

const OPTIONS = [
  { v: 1, label: 'Terrible' },
  { v: 2, label: 'Infeliz' },
  { v: 3, label: 'Mayormente insatisfecho/a' },
  { v: 4, label: 'Mixto/a' },
  { v: 5, label: 'Mayormente satisfecho/a' },
  { v: 6, label: 'Muy satisfecho/a' },
  { v: 7, label: 'Encantado/a' },
];

/** QOLS (Burckhardt / Flanagan) — 16 ítems, escala 1–7 */
const ITEMS = [
  { text: 'Comodidades materiales (hogar, alimentación, seguridad financiera)', domain: 'material' },
  { text: 'Salud — sentirse físicamente en forma y con energía', domain: 'material' },
  { text: 'Relaciones con padres, hermanos y otros familiares', domain: 'relaciones' },
  { text: 'Tener y criar hijos', domain: 'relaciones' },
  { text: 'Relación cercana con pareja o persona significativa', domain: 'relaciones' },
  { text: 'Amistades cercanas', domain: 'relaciones' },
  { text: 'Ayudar y alentar a otros, voluntariado, dar consejo', domain: 'social' },
  { text: 'Participar en organizaciones y asuntos públicos', domain: 'social' },
  { text: 'Aprendizaje — estudiar, ampliar conocimientos', domain: 'desarrollo' },
  { text: 'Conocerse a uno mismo — fortalezas, límites, sentido de la vida', domain: 'desarrollo' },
  { text: 'Trabajo — empleo o tareas en el hogar', domain: 'desarrollo' },
  { text: 'Expresarse de forma creativa', domain: 'desarrollo' },
  { text: 'Socializar — conocer gente, salir, reuniones', domain: 'recreacion' },
  { text: 'Lectura, música u ocio pasivo', domain: 'recreacion' },
  { text: 'Recreación activa (deporte, hobbies físicos)', domain: 'recreacion' },
  { text: 'Independencia — poder valerse por uno mismo', domain: 'independencia' },
];

const DOMAIN_LABELS = {
  material: 'Material y salud',
  relaciones: 'Relaciones',
  social: 'Social y cívico',
  desarrollo: 'Desarrollo personal',
  recreacion: 'Recreación',
  independencia: 'Independencia',
};

const DOMAIN_ORDER = ['material', 'relaciones', 'social', 'desarrollo', 'recreacion', 'independencia'];

function answerAt(answers, i) {
  const v = answers[i];
  if (v === null || v === undefined || v === '') return null;
  return Number(v);
}

function domainAvg(answers, domain) {
  const idx = ITEMS.map((it, i) => (it.domain === domain ? i : -1)).filter((i) => i >= 0);
  const vals = idx.map((i) => answerAt(answers, i)).filter((v) => v !== null);
  if (!vals.length) return null;
  return vals.reduce((a, v) => a + v, 0) / vals.length;
}

function totalScore(answers) {
  const vals = answers.map((_, i) => answerAt(answers, i)).filter((v) => v !== null);
  if (!vals.length) return null;
  return vals.reduce((a, v) => a + v, 0);
}

function countAnswered(answers) {
  return answers.filter((v) => v !== null && v !== undefined && v !== '').length;
}

function fmt(x) {
  if (x === null) return '—';
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
}

export async function renderQols(host, moduleRow) {
  const data = parseJsonSafe(moduleRow.data, {});
  const answers = Array.isArray(data.answers) ? data.answers : Array(16).fill(null);
  const answeredCount = countAnswered(answers);
  const total = totalScore(answers);

  const domainPills = DOMAIN_ORDER.map((d) => {
    const avg = domainAvg(answers, d);
    return `<div class="psych-score-pill qols-score-pill"><span class="psych-score-pill__label">${escapeHtml(DOMAIN_LABELS[d])}</span><strong>${fmt(avg)}</strong></div>`;
  }).join('');

  host.innerHTML = `
    <div class="card psych-module qols-module">
      <div class="psych-module__head">
        <div class="module-card-head">
          <div>
            <h2 class="module-title" style="margin:0">Escala de calidad de vida (QOLS)</h2>
            <p class="module-card-head__sub">16 ítems · escala 1 a 7 · satisfacción con áreas de la vida.</p>
          </div>
          <div class="badge badge--info module-card-head__badge" id="qols-progress" title="Ítems respondidos">${answeredCount}/16</div>
        </div>

        <div class="qols-scores psych-scores" id="qols-scores">
          <div class="psych-score-pill qols-score-pill qols-score-pill--total">
            <span class="psych-score-pill__label">Total</span>
            <strong id="qols-total">${fmt(total)}</strong>
            <span class="qols-score-pill__range">16–112</span>
          </div>
          ${domainPills}
        </div>
      </div>

      <div class="psych-module__scroll">
        <form id="qols-form" class="qols-form">
          <div class="qols-head">
            <div class="qols-head__q">Reactivo</div>
            <div class="qols-head__opts">
              ${OPTIONS.map((o) => `<span title="${escapeHtml(o.label)}">${o.v}</span>`).join('')}
            </div>
          </div>
          ${ITEMS.map((item, i) => itemRowHtml(i, item, answers[i])).join('')}
        </form>
      </div>
    </div>
  `;

  const form = host.querySelector('#qols-form');
  const progressEl = host.querySelector('#qols-progress');
  const scoresEl = host.querySelector('#qols-scores');

  const persist = async () => {
    const fd = collectFormData(form);
    const nextAnswers = ITEMS.map((_, i) => {
      const v = fd[`q${i}`];
      return v === undefined ? null : Number(v);
    });
    await syncModuleReadableText(moduleRow, { answers: nextAnswers }, 'completado');
  };

  bindAutoSave(form, persist, workspaceAutoSaveStatus());

  const recomputeLive = () => {
    const fd = collectFormData(form);
    const nextAnswers = ITEMS.map((_, i) => {
      const v = fd[`q${i}`];
      return v === undefined ? null : Number(v);
    });
    if (progressEl) progressEl.textContent = `${countAnswered(nextAnswers)}/16`;
    const totalEl = document.getElementById('qols-total');
    if (totalEl) totalEl.textContent = fmt(totalScore(nextAnswers));
    const pills = scoresEl?.querySelectorAll('.qols-score-pill:not(.qols-score-pill--total)');
    DOMAIN_ORDER.forEach((d, idx) => {
      const strong = pills?.[idx]?.querySelector('strong');
      if (strong) strong.textContent = fmt(domainAvg(nextAnswers, d));
    });
  };

  form.addEventListener('change', recomputeLive);
  form.addEventListener('input', recomputeLive);
}

function itemRowHtml(idx, item, selected) {
  return `
    <div class="qols-row">
      <div class="qols-row__q">
        <span class="qols-row__n">${idx + 1}.</span>
        <span class="qols-row__domain">${escapeHtml(DOMAIN_LABELS[item.domain])}</span>
        <span>${escapeHtml(item.text)}</span>
      </div>
      <div class="qols-row__opts" role="radiogroup" aria-label="Respuesta ${idx + 1}">
        ${OPTIONS.map((o) => {
          const checked =
            selected !== null && selected !== '' && Number(selected) === o.v ? 'checked' : '';
          return `<label class="qols-opt" title="${escapeHtml(o.label)}">
            <input type="radio" name="q${idx}" value="${o.v}" ${checked} />
            <span class="qols-dot"></span>
          </label>`;
        }).join('')}
      </div>
    </div>
  `;
}
