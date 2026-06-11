import { bindAutoSave, collectFormData } from '../autobind.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, parseJsonSafe } from '../utils.js';
import { workspaceAutoSaveStatus } from '../save-status.js';

const OPTIONS = [
  { v: 1, label: 'Totalmente en desacuerdo' },
  { v: 2, label: 'En desacuerdo' },
  { v: 3, label: 'Neutral' },
  { v: 4, label: 'De acuerdo' },
  { v: 5, label: 'Totalmente de acuerdo' },
];

/** 26 ítems — Manual EED Psicoterapia Lab */
const ITEMS = [
  'Cuando me siento abrumado/a, canalizo mi energía en actividades creativas o productivas',
  'Ayudar a otros me hace sentir mejor cuando tengo problemas personales',
  'Me doy permiso para reír o encontrar lo absurdo en situaciones tensas',
  'Planifico con anticipación situaciones difíciles para sentirme más tranquilo/a',
  'Puedo hablar abiertamente de lo que siento sin temor a ser juzgado/a',
  'Reconozco cuando estoy nervioso/a y busco estrategias concretas para manejarlo',
  'Encuentro formas de expresar emociones complejas sin hacer daño a otros',
  'Cuando algo me duele emocionalmente, prefiero no pensarlo por un tiempo',
  'Me cuesta identificar rápidamente qué emoción estoy sintiendo',
  'A veces racionalizo decisiones para no sentirme culpable',
  'Justifico mis errores con explicaciones lógicas aunque sepa que me equivoqué',
  'Disimulo lo que siento para evitar conflictos',
  'A veces siento que mis emociones cambian sin entender por qué',
  'Me auto-exijo en exceso para compensar lo que siento internamente',
  'Tengo pensamientos que sustituyen mis emociones cuando estoy en crisis',
  'Reacciono impulsivamente sin entender muy bien por qué',
  'Me enojo con personas que no tienen nada que ver con lo que me pasó',
  'Me siento como si viera mis propias reacciones desde afuera',
  'Actúo de forma muy infantil cuando me frustro o me siento rechazado/a',
  'Niego que algo me afecta, aunque por dentro esté mal',
  'Siento que el problema está en todos los demás, no en mí',
  'Imagino escenarios fantásticos para escapar de la realidad',
  'Tengo reacciones físicas (dolores, molestias) cuando algo emocional me afecta',
  'Me esfuerzo por no mostrar que otros me hieren, pero luego lo hago de forma pasiva',
  'A veces idealizo a las personas y luego me decepciono intensamente',
  'Siento que una parte de mí actúa como si la otra no existiera',
];

const ADAPT = [0, 1, 2, 3, 4, 5, 6, 7];
const INTER = [8, 9, 10, 11, 12, 13, 14];
const MALAD = [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];

function answerAt(answers, i) {
  const v = answers[i];
  if (v === null || v === undefined || v === '') return null;
  return Number(v);
}

function avg(idx, answers) {
  const vals = idx.map((i) => answerAt(answers, i)).filter((v) => v !== null);
  if (!vals.length) return null;
  return vals.reduce((a, v) => a + v, 0) / vals.length;
}

function countAnswered(answers) {
  return answers.filter((v) => v !== null && v !== undefined && v !== '').length;
}

function band(avgScore) {
  if (avgScore === null) return { label: '—', cls: '' };
  if (avgScore >= 3.7) return { label: 'Alta', cls: 'eed-band--high' };
  if (avgScore >= 2.4) return { label: 'Media', cls: 'eed-band--mid' };
  return { label: 'Baja', cls: 'eed-band--low' };
}

function fmt(x) {
  if (x === null) return '—';
  return x.toFixed(1);
}

export async function renderEed(host, moduleRow) {
  const data = parseJsonSafe(moduleRow.data, {});
  const answers = Array.isArray(data.answers) ? data.answers : Array(26).fill(null);
  const a = avg(ADAPT, answers);
  const i = avg(INTER, answers);
  const m = avg(MALAD, answers);
  const ba = band(a);
  const bi = band(i);
  const bm = band(m);
  const answeredCount = countAnswered(answers);

  host.innerHTML = `
    <div class="card psych-module eed-module">
      <div class="psych-module__head">
        <div class="module-card-head">
          <div>
            <h2 class="module-title" style="margin:0">Escala de estilos defensivos (EED)</h2>
            <p class="module-card-head__sub">26 ítems · escala 1 a 5 · una vez por tratamiento.</p>
          </div>
          <div class="badge badge--info module-card-head__badge" id="eed-progress" title="Ítems respondidos">${answeredCount}/26</div>
        </div>

        <div class="eed-scores" id="eed-scores">
          <div class="psych-score-pill eed-score-pill ${ba.cls}"><span class="psych-score-pill__label">Adaptativas</span><strong id="eed-a">${fmt(a)}</strong><span id="eed-a-l">${ba.label}</span></div>
          <div class="psych-score-pill eed-score-pill ${bi.cls}"><span class="psych-score-pill__label">Intermedias</span><strong id="eed-i">${fmt(i)}</strong><span id="eed-i-l">${bi.label}</span></div>
          <div class="psych-score-pill eed-score-pill ${bm.cls}"><span class="psych-score-pill__label">Desadaptativas</span><strong id="eed-m">${fmt(m)}</strong><span id="eed-m-l">${bm.label}</span></div>
        </div>
      </div>

      <div class="psych-module__scroll">
        <form id="eed-form" class="likert-form">
          <div class="likert-head">
            <div class="likert-head__q">Reactivo</div>
            <div class="likert-head__opts">
              ${OPTIONS.map((o) => `<span title="${escapeHtml(o.label)}">${escapeHtml(o.label)}</span>`).join('')}
            </div>
          </div>
          ${ITEMS.map((text, idx) => likertRowHtml(idx, text, answers[idx])).join('')}
        </form>
      </div>
    </div>
  `;

  const form = host.querySelector('#eed-form');
  const progressEl = host.querySelector('#eed-progress');

  const persist = async () => {
    const fd = collectFormData(form);
    const nextAnswers = ITEMS.map((_, k) => {
      const v = fd[`q${k}`];
      return v === undefined ? null : Number(v);
    });
    await syncModuleReadableText(moduleRow, { answers: nextAnswers }, 'completado');
  };
  bindAutoSave(form, persist, workspaceAutoSaveStatus());

  const recomputeLive = () => {
    const fd = collectFormData(form);
    const nextAnswers = ITEMS.map((_, k) => {
      const v = fd[`q${k}`];
      return v === undefined ? null : Number(v);
    });
    const aa = avg(ADAPT, nextAnswers);
    const ii = avg(INTER, nextAnswers);
    const mm = avg(MALAD, nextAnswers);
    const baa = band(aa);
    const bii = band(ii);
    const bmm = band(mm);
    if (progressEl) progressEl.textContent = `${countAnswered(nextAnswers)}/26`;
    updateScore('eed-a', 'eed-a-l', aa, baa);
    updateScore('eed-i', 'eed-i-l', ii, bii);
    updateScore('eed-m', 'eed-m-l', mm, bmm);
    updatePillClasses(host.querySelector('#eed-scores'), [baa, bii, bmm]);
  };

  form.addEventListener('change', recomputeLive);
  form.addEventListener('input', recomputeLive);
}

function updateScore(scoreId, labelId, value, b) {
  const s = document.getElementById(scoreId);
  const l = document.getElementById(labelId);
  if (s) s.textContent = fmt(value);
  if (l) l.textContent = b.label;
}

function updatePillClasses(container, bands) {
  if (!container) return;
  const pills = container.querySelectorAll('.eed-score-pill');
  pills.forEach((pill, idx) => {
    pill.className = `psych-score-pill eed-score-pill ${bands[idx]?.cls || ''}`;
  });
}

function likertRowHtml(idx, text, selected) {
  return `
    <div class="likert-row">
      <div class="likert-row__q">
        <span class="likert-row__n">${idx + 1}.</span>
        <span>${escapeHtml(text)}</span>
      </div>
      <div class="likert-row__opts" role="radiogroup">
        ${OPTIONS.map((o) => {
          const checked =
            selected !== null && selected !== '' && Number(selected) === o.v ? 'checked' : '';
          return `<label class="likert-opt" title="${escapeHtml(o.label)}">
            <input type="radio" name="q${idx}" value="${o.v}" ${checked} />
            <span class="likert-dot"></span>
          </label>`;
        }).join('')}
      </div>
    </div>
  `;
}
