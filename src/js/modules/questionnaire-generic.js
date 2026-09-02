/**
 * Renderer genérico de cuestionarios declarativos (schema 1).
 *
 * Sirve a los cuestionarios importados en packs privados y a los creados en la
 * app (creador manual o chatbot). Las escalas históricas siguen con su renderer
 * propio; comparten el schema solo para exportarse y compartirse por enlace.
 */
import { bindAutoSave } from '../autobind.js';
import { getCustomModuleByType } from '../custom-modules.js';
import { getModule } from '../db.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, parseJsonSafe } from '../utils.js';
import { workspaceAutoSaveStatus } from '../save-status.js';
import {
  emptyAnswers,
  optionsForItem,
  questionnaireItems,
  scoreQuestionnaire,
} from '../../lib/questionnaire-schema.js';

function itemHtml(def, item, selected) {
  const opts = optionsForItem(def, item.index);
  const isRisk = (def.riskItems || []).some((r) => r.index === item.index);
  return `
    <div class="psych-item${isRisk ? ' psych-item--risk' : ''}">
      <div class="psych-item__q">
        <span class="psych-item__n">${item.index + 1}.</span>
        <span>${escapeHtml(item.text)}</span>
      </div>
      <div class="psych-item__opts" role="radiogroup" aria-label="Respuesta ${item.index + 1}">
        ${opts
          .map((o) => {
            const checked =
              selected !== null && selected !== '' && Number(selected) === Number(o.v)
                ? 'checked'
                : '';
            return `<label class="psych-item__opt">
              <input type="radio" name="q${item.index}" value="${escapeHtml(String(o.v))}" ${checked} />
              <span class="psych-item__opt-v">${escapeHtml(String(o.v))}</span>
              <span>${escapeHtml(o.label)}</span>
            </label>`;
          })
          .join('')}
      </div>
    </div>`;
}

function scoresHtml(def, score) {
  const kindLabel = def.scoring?.kind === 'mean' ? 'Media' : 'Puntuación total';
  const subs = (score?.subscales || []).filter((s) => s.total !== null);
  return `
    <div class="psych-scores" id="q-scores">
      <div class="psych-score-pill ${score?.cls || ''}" id="q-pill">
        <span class="psych-score-pill__label">${escapeHtml(kindLabel)}</span>
        <strong id="q-score">${score ? score.total : '—'}</strong>
        <span id="q-label">${escapeHtml(score?.label || '—')}</span>
      </div>
      ${subs
        .map(
          (s) => `<div class="psych-score-pill psych-score-pill--sub">
        <span class="psych-score-pill__label">${escapeHtml(s.label)}</span>
        <strong>${s.total}</strong>
      </div>`,
        )
        .join('')}
    </div>`;
}

function attributionHtml(def) {
  const a = def.attribution;
  if (!a) return '';
  const parts = [
    a.authors ? `${a.authors}${a.year ? ` (${a.year})` : ''}` : '',
    a.license ? `Licencia: ${a.license}` : '',
    a.source || '',
    a.note || '',
  ].filter(Boolean);
  if (!parts.length) return '';
  return `<p class="gad7-note">${escapeHtml(parts.join(' · '))}</p>`;
}

function answersFromForm(form, def) {
  const items = questionnaireItems(def);
  return items.map((item) => {
    const el = form.querySelector(`input[name="q${item.index}"]:checked`);
    return el ? Number(el.value) : null;
  });
}

/**
 * Pinta un cuestionario declarativo y lo autoguarda.
 * @param {HTMLElement} host
 * @param {object} moduleRow Fila de `session_modules`.
 * @param {object} def Definición schema 1.
 */
export async function renderQuestionnaireDef(host, moduleRow, def) {
  const data = parseJsonSafe(moduleRow.data, {});
  const items = questionnaireItems(def);
  const answers = Array.isArray(data.answers) ? data.answers : emptyAnswers(def);
  const score = scoreQuestionnaire(def, answers);

  host.innerHTML = `
    <div class="card psych-module questionnaire-module">
      <div class="psych-module__head">
        <div class="module-card-head">
          <div>
            <h2 class="module-title" style="margin:0">${escapeHtml(def.title)}</h2>
            ${def.subtitle ? `<p class="module-card-head__sub">${escapeHtml(def.subtitle)}</p>` : ''}
          </div>
          <div class="badge badge--info module-card-head__badge" id="q-progress" title="Ítems respondidos">${score?.answered || 0}/${items.length}</div>
        </div>
        ${def.scoring ? scoresHtml(def, score) : ''}
      </div>

      <div class="psych-module__scroll">
        ${def.instructions ? `<p class="questionnaire-module__instructions">${escapeHtml(def.instructions)}</p>` : ''}
        <form id="q-form" class="likert-form">
          ${items.map((item) => itemHtml(def, item, answers[item.index])).join('')}
        </form>

        <div class="psych-alert" id="q-risk" ${score?.riskFlags?.length ? '' : 'hidden'}>
          <div><strong id="q-risk-text">${escapeHtml(score?.riskFlags?.[0]?.message || '')}</strong></div>
        </div>

        ${attributionHtml(def)}
      </div>
    </div>`;

  const form = host.querySelector('#q-form');

  const persist = async () => {
    if (!form.isConnected) return;
    const fresh = await getModule(moduleRow.id);
    await syncModuleReadableText(fresh || moduleRow, { answers: answersFromForm(form, def) }, 'completado');
  };
  bindAutoSave(form, persist, workspaceAutoSaveStatus());

  const recomputeLive = () => {
    const next = scoreQuestionnaire(def, answersFromForm(form, def));
    const progressEl = host.querySelector('#q-progress');
    const scoreEl = host.querySelector('#q-score');
    const labelEl = host.querySelector('#q-label');
    const pill = host.querySelector('#q-pill');
    const riskEl = host.querySelector('#q-risk');
    const riskText = host.querySelector('#q-risk-text');

    if (progressEl) progressEl.textContent = `${next?.answered || 0}/${items.length}`;
    if (scoreEl) scoreEl.textContent = next ? String(next.total) : '—';
    if (labelEl) labelEl.textContent = next?.label || '—';
    if (pill) pill.className = `psych-score-pill ${next?.cls || ''}`;
    if (riskEl) riskEl.hidden = !next?.riskFlags?.length;
    if (riskText && next?.riskFlags?.length) riskText.textContent = next.riskFlags[0].message;
  };

  form.addEventListener('change', recomputeLive);
  form.addEventListener('input', recomputeLive);
}

/** Entrada usada por el registry: resuelve la definición del módulo guardado. */
export async function renderDeclarativeQuestionnaire(host, moduleRow) {
  const mod = getCustomModuleByType(moduleRow.module_type);
  const def = mod?.def;
  if (!def) {
    host.innerHTML = `<div class="card"><p class="text-muted">Este cuestionario ya no está en tu librería. Si venía de un pack, vuelve a importarlo.</p></div>`;
    return;
  }
  await renderQuestionnaireDef(host, moduleRow, def);
}
