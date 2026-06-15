import { bindAutoSave, collectFormData } from '../autobind.js';
import {
  PCL5_TOTAL,
  computePcl5Scores,
  pcl5ScreenLabel,
} from '../pcl5-scoring.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, parseJsonSafe } from '../utils.js';
import { workspaceAutoSaveStatus } from '../save-status.js';
import { t } from '../i18n.js';

function options() {
  return [
    { v: 0, label: t('pcl5.opt0', 'Nada') },
    { v: 1, label: t('pcl5.opt1', 'Un poco') },
    { v: 2, label: t('pcl5.opt2', 'Moderadamente') },
    { v: 3, label: t('pcl5.opt3', 'Bastante') },
    { v: 4, label: t('pcl5.opt4', 'Extremadamente') },
  ];
}

function items() {
  return [
    t('pcl5.q1', 'Recuerdos repetidos, perturbadores e indeseados sobre la experiencia estresante'),
    t('pcl5.q2', 'Sueños repetidos y perturbadores sobre la experiencia estresante'),
    t(
      'pcl5.q3',
      'Sentir o actuar repentinamente como si la experiencia estresante estuviera sucediendo nuevamente (como si la estuviera reviviendo)',
    ),
    t('pcl5.q4', 'Sentirse muy angustiado/a cuando algo le hizo recordar la experiencia estresante'),
    t(
      'pcl5.q5',
      'Tener reacciones físicas intensas cuando algo le hizo recordar la experiencia estresante (p. ej. latidos fuertes, dificultad para respirar, sudoración)',
    ),
    t('pcl5.q6', 'Evitar recuerdos, pensamientos o sentimientos relacionados con la experiencia estresante'),
    t(
      'pcl5.q7',
      'Evitar recordatorios externos (personas, lugares, conversaciones, actividades, objetos o situaciones) que le hacen recordar la experiencia estresante',
    ),
    t('pcl5.q8', 'Dificultad para recordar partes importantes de la experiencia estresante'),
    t(
      'pcl5.q9',
      'Creencias o expectativas negativas persistentes sobre usted mismo/a, los demás o el mundo (p. ej. «soy malo/a», «nadie es confiable», «el mundo es peligroso»)',
    ),
    t('pcl5.q10', 'Culparse a sí mismo/a o culpar a otros por la experiencia estresante o lo ocurrido después'),
    t('pcl5.q11', 'Sentimientos negativos intensos como miedo, horror, ira, culpa o vergüenza'),
    t('pcl5.q12', 'Pérdida de interés en actividades que antes disfrutaba'),
    t('pcl5.q13', 'Sentirse distante o enajenado/a de otras personas'),
    t('pcl5.q14', 'Dificultad para experimentar sentimientos positivos (p. ej. felicidad, satisfacción o amor)'),
    t('pcl5.q15', 'Irritabilidad, explosiones de rabia o actuar agresivamente'),
    t('pcl5.q16', 'Tomar demasiados riesgos o hacer cosas que pudieron haberle causado daño'),
    t('pcl5.q17', 'Estar «extremadamente alerta», vigilante o en guardia'),
    t('pcl5.q18', 'Sentirse muy nervioso/a o sobresaltarse fácilmente'),
    t('pcl5.q19', 'Tener dificultad para concentrarse'),
    t('pcl5.q20', 'Tener dificultad para dormirse o mantener el sueño'),
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

function itemRowHtml(idx, text, selected, opts) {
  return `
    <div class="likert-row pcl5-row">
      <div class="likert-row__q">
        <span class="likert-row__n">${idx + 1}.</span>
        <span>${escapeHtml(text)}</span>
      </div>
      <div class="likert-row__opts pcl5-row__opts" role="radiogroup" aria-label="${escapeHtml(t('pcl5.response', 'Respuesta'))} ${idx + 1}">
        ${opts
          .map((o) => {
            const checked =
              selected !== null && selected !== '' && Number(selected) === o.v ? 'checked' : '';
            return `<label class="likert-opt pcl5-opt" title="${escapeHtml(o.label)}">
            <input type="radio" name="q${idx}" value="${o.v}" ${checked} />
            <span class="likert-dot"></span>
          </label>`;
          })
          .join('')}
      </div>
    </div>`;
}

function answersFromForm(form) {
  const fd = collectFormData(form);
  return Array.from({ length: PCL5_TOTAL }, (_, i) => {
    const v = fd[`q${i}`];
    return v === undefined ? null : Number(v);
  });
}

export async function renderPcl5(host, moduleRow) {
  const data = parseJsonSafe(moduleRow.data, {});
  const answers = Array.isArray(data.answers) ? data.answers : Array(PCL5_TOTAL).fill(null);
  const scores = computePcl5Scores(answers);
  const answeredCount = countAnswered(answers);
  const opts = options();
  const itemList = items();
  const screenCls =
    scores.complete && scores.probablePtsd ? 'pcl5-band--pos' : 'pcl5-band--neg';

  host.innerHTML = `
    <div class="card psych-module pcl5-module">
      <div class="psych-module__head">
        <div class="module-card-head">
          <div>
            <h2 class="module-title" style="margin:0">${escapeHtml(t('pcl5.title', 'PCL-5 — Tamizaje TEPT (DSM-5)'))}</h2>
            <p class="module-card-head__sub">${escapeHtml(t('pcl5.subtitle', '20 ítems · escala 0–4 · último mes · una vez por sesión.'))}</p>
          </div>
          <div class="badge badge--info module-card-head__badge" id="pcl5-progress" title="${escapeHtml(t('pcl5.progress', 'Ítems respondidos'))}">${answeredCount}/${PCL5_TOTAL}</div>
        </div>

        <div class="psych-scores pcl5-scores" id="pcl5-scores">
          <div class="psych-score-pill pcl5-score-pill ${screenCls}" id="pcl5-pill">
            <span class="psych-score-pill__label">${escapeHtml(t('pcl5.total', 'Puntuación total'))}</span>
            <strong id="pcl5-score">${scores.total === null ? '—' : scores.total}</strong>
            <span id="pcl5-label">${escapeHtml(scores.complete ? pcl5ScreenLabel(scores.probablePtsd) : '—')}</span>
          </div>
        </div>
      </div>

      <div class="psych-module__scroll">
        <form id="pcl5-form" class="likert-form pcl5-form">
          <div class="likert-head pcl5-head">
            <div class="likert-head__q">${escapeHtml(t('pcl5.item', 'Ítem'))}</div>
            <div class="likert-head__opts pcl5-head__opts">
              ${likertHeadHtml(opts)}
            </div>
          </div>
          ${itemList.map((text, idx) => itemRowHtml(idx, text, answers[idx], opts)).join('')}
        </form>

        <p class="pcl5-note">${escapeHtml(t('pcl5.note', 'PCL-5 (Weathers et al., DSM-5). Punto de corte orientativo ≥31. No sustituye evaluación clínica ni entrevista estructurada.'))}</p>
      </div>
    </div>
  `;

  const form = host.querySelector('#pcl5-form');
  const progressEl = host.querySelector('#pcl5-progress');

  const persist = async () => {
    const next = answersFromForm(form);
    await syncModuleReadableText(moduleRow, { answers: next }, 'completado');
  };
  bindAutoSave(form, persist, workspaceAutoSaveStatus());

  const recomputeLive = () => {
    const next = answersFromForm(form);
    const s = computePcl5Scores(next);
    const answered = countAnswered(next);

    if (progressEl) progressEl.textContent = `${answered}/${PCL5_TOTAL}`;

    const scoreEl = host.querySelector('#pcl5-score');
    const labelEl = host.querySelector('#pcl5-label');
    const pill = host.querySelector('#pcl5-pill');

    if (scoreEl) scoreEl.textContent = s.total === null ? '—' : String(s.total);
    if (labelEl) labelEl.textContent = s.complete ? pcl5ScreenLabel(s.probablePtsd) : '—';
    if (pill) {
      const cls = s.complete && s.probablePtsd ? 'pcl5-band--pos' : 'pcl5-band--neg';
      pill.className = `psych-score-pill pcl5-score-pill ${cls}`;
    }
  };

  form.addEventListener('change', recomputeLive);
  form.addEventListener('input', recomputeLive);
}

export { pcl5Summary } from '../pcl5-scoring.js';
