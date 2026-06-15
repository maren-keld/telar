import { bindAutoSave, collectFormData } from '../autobind.js';
import { IESR_TOTAL, computeIesrScores, iesrScreenLabel } from '../iesr-scoring.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, parseJsonSafe } from '../utils.js';
import { workspaceAutoSaveStatus } from '../save-status.js';
import { t } from '../i18n.js';

function options() {
  return [
    { v: 0, label: t('iesr.opt0', 'Nada') },
    { v: 1, label: t('iesr.opt1', 'Un poco') },
    { v: 2, label: t('iesr.opt2', 'Moderadamente') },
    { v: 3, label: t('iesr.opt3', 'Bastante') },
    { v: 4, label: t('iesr.opt4', 'Extremadamente') },
  ];
}

function items() {
  return [
    t('iesr.q1', '¿Cualquier recordatorio le hizo revivir la experiencia?'),
    t('iesr.q2', '¿Tuvo dificultad para permanecer dormido/a?'),
    t('iesr.q3', '¿Otras cosas le hicieron revivir la experiencia?'),
    t('iesr.q4', '¿Se sintió irritable o con enojo?'),
    t('iesr.q5', '¿Evitó dejarse sentir mal cuando pensaba en ello o le recordaban el evento?'),
    t('iesr.q6', '¿Pensó en ello cuando no tenía la intención de hacerlo?'),
    t('iesr.q7', '¿Sintió que no había ocurrido o que no era real?'),
    t('iesr.q8', '¿Evitó situaciones o personas que le recordaban el evento?'),
    t('iesr.q9', '¿Imágenes sobre ello aparecían en su mente?'),
    t('iesr.q10', '¿Se sobresaltaba o se asustaba fácilmente?'),
    t('iesr.q11', '¿Trató de no pensar en ello?'),
    t('iesr.q12', '¿Era consciente de que aún tenía sentimientos sobre ello pero no los enfrentaba?'),
    t('iesr.q13', '¿Sus sentimientos sobre ello estaban entumecidos?'),
    t('iesr.q14', '¿Actuó o sintió como si estuviera de nuevo en ese momento?'),
    t('iesr.q15', '¿Tuvo dificultad para conciliar el sueño?'),
    t('iesr.q16', '¿Tuvo oleadas de sentimientos intensos sobre ello?'),
    t('iesr.q17', '¿Trató de eliminarlo de su memoria?'),
    t('iesr.q18', '¿Tuvo dificultad para concentrarse?'),
    t(
      'iesr.q19',
      '¿Los recordatorios le provocaron reacciones físicas (sudoración, palpitaciones, dificultad para respirar)?',
    ),
    t('iesr.q20', '¿Tuvo sueños sobre ello?'),
    t('iesr.q21', '¿Se sintió alerta o en guardia?'),
    t('iesr.q22', '¿Trató de no hablar sobre ello?'),
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
    <div class="likert-row iesr-row">
      <div class="likert-row__q">
        <span class="likert-row__n">${idx + 1}.</span>
        <span>${escapeHtml(text)}</span>
      </div>
      <div class="likert-row__opts iesr-row__opts" role="radiogroup" aria-label="${escapeHtml(t('iesr.response', 'Respuesta'))} ${idx + 1}">
        ${opts
          .map((o) => {
            const checked =
              selected !== null && selected !== '' && Number(selected) === o.v ? 'checked' : '';
            return `<label class="likert-opt iesr-opt" title="${escapeHtml(o.label)}">
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
  return Array.from({ length: IESR_TOTAL }, (_, i) => {
    const v = fd[`q${i}`];
    return v === undefined ? null : Number(v);
  });
}

export async function renderIesr(host, moduleRow) {
  const data = parseJsonSafe(moduleRow.data, {});
  const answers = Array.isArray(data.answers) ? data.answers : Array(IESR_TOTAL).fill(null);
  const scores = computeIesrScores(answers);
  const answeredCount = countAnswered(answers);
  const opts = options();
  const itemList = items();
  const screenCls = scores.complete && scores.elevated ? 'iesr-band--pos' : 'iesr-band--neg';

  host.innerHTML = `
    <div class="card psych-module iesr-module">
      <div class="psych-module__head">
        <div class="module-card-head">
          <div>
            <h2 class="module-title" style="margin:0">${escapeHtml(t('iesr.title', 'IES-R — Impacto del evento'))}</h2>
            <p class="module-card-head__sub">${escapeHtml(t('iesr.subtitle', '22 ítems · escala 0–4 · últimos 7 días · subescalas intrusión, evitación, hiperactivación.'))}</p>
          </div>
          <div class="badge badge--info module-card-head__badge" id="iesr-progress" title="${escapeHtml(t('iesr.progress', 'Ítems respondidos'))}">${answeredCount}/${IESR_TOTAL}</div>
        </div>

        <div class="psych-scores iesr-scores" id="iesr-scores">
          <div class="psych-score-pill iesr-score-pill ${screenCls}" id="iesr-pill">
            <span class="psych-score-pill__label">${escapeHtml(t('iesr.total', 'Total'))}</span>
            <strong id="iesr-score">${scores.total === null ? '—' : scores.total}</strong>
            <span id="iesr-label">${escapeHtml(scores.complete ? iesrScreenLabel(scores.elevated) : '—')}</span>
          </div>
          <div class="psych-score-pill iesr-score-pill iesr-score-pill--sub">
            <span class="psych-score-pill__label">${escapeHtml(t('iesr.intrusion', 'Intrusión'))}</span>
            <strong id="iesr-intr">${scores.total === null ? '—' : scores.intrusion}</strong>
          </div>
          <div class="psych-score-pill iesr-score-pill iesr-score-pill--sub">
            <span class="psych-score-pill__label">${escapeHtml(t('iesr.avoidance', 'Evitación'))}</span>
            <strong id="iesr-avoid">${scores.total === null ? '—' : scores.avoidance}</strong>
          </div>
          <div class="psych-score-pill iesr-score-pill iesr-score-pill--sub">
            <span class="psych-score-pill__label">${escapeHtml(t('iesr.hyper', 'Hiperactivación'))}</span>
            <strong id="iesr-hyper">${scores.total === null ? '—' : scores.hyperarousal}</strong>
          </div>
        </div>
      </div>

      <div class="psych-module__scroll">
        <form id="iesr-form" class="likert-form iesr-form">
          <label class="iesr-event-label">
            <span>${escapeHtml(t('iesr.event', 'Evento estresante de referencia (opcional)'))}</span>
            <input type="text" name="event_label" value="${escapeHtml(data.event_label || '')}" placeholder="${escapeHtml(t('iesr.eventPh', 'p. ej. accidente, violencia, pérdida'))}" />
          </label>
          <div class="likert-head iesr-head">
            <div class="likert-head__q">${escapeHtml(t('iesr.item', 'Ítem'))}</div>
            <div class="likert-head__opts iesr-head__opts">
              ${likertHeadHtml(opts)}
            </div>
          </div>
          ${itemList.map((text, idx) => itemRowHtml(idx, text, answers[idx], opts)).join('')}
        </form>

        <p class="iesr-note">${escapeHtml(t('iesr.note', 'IES-R (Weiss & Marmar). Umbral orientativo total ≥33. No sustituye evaluación clínica.'))}</p>
      </div>
    </div>
  `;

  const form = host.querySelector('#iesr-form');
  const progressEl = host.querySelector('#iesr-progress');

  const persist = async () => {
    const fd = collectFormData(form);
    const next = answersFromForm(form);
    await syncModuleReadableText(
      moduleRow,
      { answers: next, event_label: fd.event_label || '' },
      'completado',
    );
  };
  bindAutoSave(form, persist, workspaceAutoSaveStatus());

  const recomputeLive = () => {
    const next = answersFromForm(form);
    const s = computeIesrScores(next);
    const answered = countAnswered(next);

    if (progressEl) progressEl.textContent = `${answered}/${IESR_TOTAL}`;

    const set = (id, val) => {
      const el = host.querySelector(id);
      if (el) el.textContent = val;
    };
    set('#iesr-score', s.total === null ? '—' : String(s.total));
    set('#iesr-intr', s.total === null ? '—' : String(s.intrusion));
    set('#iesr-avoid', s.total === null ? '—' : String(s.avoidance));
    set('#iesr-hyper', s.total === null ? '—' : String(s.hyperarousal));
    set('#iesr-label', s.complete ? iesrScreenLabel(s.elevated) : '—');

    const pill = host.querySelector('#iesr-pill');
    if (pill) {
      const cls = s.complete && s.elevated ? 'iesr-band--pos' : 'iesr-band--neg';
      pill.className = `psych-score-pill iesr-score-pill ${cls}`;
    }
  };

  form.addEventListener('change', recomputeLive);
  form.addEventListener('input', recomputeLive);
}

export { iesrSummary } from '../iesr-scoring.js';
