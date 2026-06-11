import { bindAutoSave, collectFormData } from '../autobind.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, parseJsonSafe } from '../utils.js';
import { workspaceAutoSaveStatus } from '../save-status.js';

const OPTIONS = [
  { v: 0, label: 'Nunca' },
  { v: 1, label: 'A veces' },
  { v: 2, label: 'A menudo' },
  { v: 3, label: 'Casi siempre' },
];

const ITEMS = [
  'Me costó mucho relajarme',
  'Me di cuenta que tenía la boca seca',
  'No podía sentir ningún sentimiento positivo',
  'Se me hizo difícil respirar',
  'Me costó iniciar cosas',
  'Reaccioné en exceso a situaciones',
  'Sentí temblores (por ejemplo, en las manos)',
  'Sentí que estaba usando mucha energía nerviosa',
  'Me preocupé por situaciones en que podría entrar en pánico',
  'Sentí que no tenía nada por lo que entusiasmarme',
  'Me sentí inquieto/a',
  'Me costó relajarme por estar agitado/a',
  'Me sentí triste y deprimido/a',
  'Me sentí intolerante ante interrupciones',
  'Sentí que estaba al borde del pánico',
  'No pude experimentar entusiasmo por nada',
  'Sentí que no valía mucho como persona',
  'Me sentí irritable',
  'Sentí palpitaciones sin esfuerzo físico',
  'Sentí miedo sin motivo',
  'Sentí que la vida no tenía sentido',
];

const STRESS = [0, 5, 7, 10, 11, 13, 17];
const ANXIETY = [1, 3, 6, 8, 14, 18, 19];
const DEPRESSION = [2, 4, 9, 12, 15, 16, 20];

function answerAt(answers, i) {
  const v = answers[i];
  if (v === null || v === undefined || v === '') return null;
  return Number(v);
}

function sum(idx, answers) {
  return idx.reduce((a, i) => {
    const v = answerAt(answers, i);
    return a + (v === null ? 0 : v);
  }, 0);
}

function countAnswered(answers) {
  return answers.filter((v) => v !== null && v !== undefined && v !== '').length;
}

const SEVERITY_CLASS = {
  Normal: 'dass-sev--normal',
  Leve: 'dass-sev--mild',
  Moderado: 'dass-sev--moderate',
  Severo: 'dass-sev--severe',
  'Extremadamente severo': 'dass-sev--extreme',
};

function severityInfo(kind, score) {
  const s = score * 2;
  const bands =
    kind === 'depresion'
      ? [
          ['Normal', 0, 9],
          ['Leve', 10, 13],
          ['Moderado', 14, 20],
          ['Severo', 21, 27],
          ['Extremadamente severo', 28, 999],
        ]
      : kind === 'ansiedad'
        ? [
            ['Normal', 0, 7],
            ['Leve', 8, 9],
            ['Moderado', 10, 14],
            ['Severo', 15, 19],
            ['Extremadamente severo', 20, 999],
          ]
        : [
            ['Normal', 0, 14],
            ['Leve', 15, 18],
            ['Moderado', 19, 25],
            ['Severo', 26, 33],
            ['Extremadamente severo', 34, 999],
          ];
  const label = bands.find((b) => s >= b[1] && s <= b[2])?.[0] || '—';
  return { label, cls: SEVERITY_CLASS[label] || '' };
}

function severityLabelHtml(kind, score) {
  const { label, cls } = severityInfo(kind, score);
  if (label === '—') return escapeHtml(label);
  return `<span class="dass-sev ${cls}">${escapeHtml(label)}</span>`;
}

function scoresFromAnswers(answers) {
  const depression = sum(DEPRESSION, answers);
  const anxiety = sum(ANXIETY, answers);
  const stress = sum(STRESS, answers);
  return { depression, anxiety, stress };
}

export async function renderDass21(host, moduleRow) {
  const data = parseJsonSafe(moduleRow.data, {});
  const answers = Array.isArray(data.answers) ? data.answers : Array(21).fill(null);
  const { depression, anxiety, stress } = scoresFromAnswers(answers);
  const answeredCount = countAnswered(answers);

  host.innerHTML = `
    <div class="card psych-module dass-module">
      <div class="psych-module__head">
        <div class="module-card-head">
          <div>
            <h2 class="module-title" style="margin:0">DASS-21</h2>
            <p class="module-card-head__sub">
              Últimos 7 días · Marca una opción por reactivo.
            </p>
          </div>
          <div class="badge badge--info module-card-head__badge" id="dass-progress" title="Respondidas / Total">${answeredCount}/21</div>
        </div>

        <div class="psych-scores dass-scores" id="dass-scores">
          ${dassScorePillHtml('Depresión', 'dass-dep', severityInfo('depresion', depression), depression * 2)}
          ${dassScorePillHtml('Ansiedad', 'dass-anx', severityInfo('ansiedad', anxiety), anxiety * 2)}
          ${dassScorePillHtml('Estrés', 'dass-str', severityInfo('estres', stress), stress * 2)}
        </div>
      </div>

      <div class="psych-module__scroll">
        <form id="dass-form" class="dass-form">
          <div class="dass-head">
            <div class="dass-head__q">Reactivo</div>
            <div class="dass-head__opts">
              ${OPTIONS.map((o) => `<span>${escapeHtml(o.label)}</span>`).join('')}
            </div>
          </div>
          ${ITEMS.map((text, i) => itemRowHtml(i, text, answers[i])).join('')}
        </form>
      </div>
    </div>
  `;

  const form = host.querySelector('#dass-form');
  const progressEl = host.querySelector('#dass-progress');
  const scoresEl = host.querySelector('#dass-scores');

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
    const { depression: de, anxiety: an, stress: st } = scoresFromAnswers(nextAnswers);
    if (progressEl) progressEl.textContent = `${countAnswered(nextAnswers)}/21`;
    updateDassPill(scoresEl, 0, 'Depresión', de, severityInfo('depresion', de));
    updateDassPill(scoresEl, 1, 'Ansiedad', an, severityInfo('ansiedad', an));
    updateDassPill(scoresEl, 2, 'Estrés', st, severityInfo('estres', st));
  };

  form.addEventListener('change', recomputeLive);
  form.addEventListener('input', recomputeLive);
}

function dassScorePillHtml(dimLabel, idPrefix, { label, cls }, score) {
  return `
    <div class="psych-score-pill dass-score-pill ${cls}">
      <span class="psych-score-pill__label">${escapeHtml(dimLabel)}</span>
      <strong id="${idPrefix}-score">${score}</strong>
      <span id="${idPrefix}-label">${escapeHtml(label)}</span>
    </div>`;
}

function updateDassPill(container, idx, _dimLabel, rawScore, { label, cls }) {
  const idPrefix = ['dass-dep', 'dass-anx', 'dass-str'][idx];
  const pill = container?.querySelectorAll('.dass-score-pill')[idx];
  if (pill) pill.className = `psych-score-pill dass-score-pill ${cls}`;
  const scoreEl = document.getElementById(`${idPrefix}-score`);
  const labelEl = document.getElementById(`${idPrefix}-label`);
  if (scoreEl) scoreEl.textContent = String(rawScore * 2);
  if (labelEl) labelEl.textContent = label;
}

function itemRowHtml(idx, text, selected) {
  return `
    <div class="dass-row">
      <div class="dass-row__q">
        <span class="dass-row__n">${idx + 1}.</span>
        <span>${escapeHtml(text)}</span>
      </div>
      <div class="dass-row__opts" role="radiogroup" aria-label="Respuesta ${idx + 1}">
        ${OPTIONS.map((o) => {
          const checked =
            selected !== null && selected !== '' && Number(selected) === o.v ? 'checked' : '';
          return `<label class="dass-opt" title="${escapeHtml(o.label)}">
            <input type="radio" name="q${idx}" value="${o.v}" ${checked} />
            <span class="dass-dot"></span>
          </label>`;
        }).join('')}
      </div>
    </div>
  `;
}
