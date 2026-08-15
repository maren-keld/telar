import { bindAutoSave } from '../autobind.js';
import { getCustomModuleByType, parseCustomModuleType } from '../custom-modules.js';
import { CUSTOM_ITEM_TYPES } from '../custom-module-items.js';
import { getModule } from '../db.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, parseJsonSafe } from '../utils.js';
import { workspaceAutoSaveStatus } from '../save-status.js';

function renderRichText(text = '') {
  return escapeHtml(String(text))
    .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

export async function renderCustomQuestionnaire(host, moduleRow, ctx) {
  const customId = parseCustomModuleType(moduleRow.module_type);
  const def = getCustomModuleByType(moduleRow.module_type);
  if (!def) {
    host.innerHTML = `<div class="card"><p class="text-muted">Módulo personalizado no encontrado. Puede haber sido eliminado del perfil.</p></div>`;
    return;
  }

  const data = parseJsonSafe(moduleRow.data, {});
  const answers = data.answers || {};

  host.innerHTML = `
    <div class="card custom-questionnaire">
      <h2 class="module-title">${escapeHtml(def.title)}</h2>
      ${def.instructions ? `<p class="custom-questionnaire__instructions">${renderRichText(def.instructions)}</p>` : ''}
      <form id="form-custom-${customId}" class="custom-questionnaire__form">
        ${def.questions
          .map((q, qi) => {
            if (q.type === 'info') {
              return `
            <div class="custom-q custom-q--info">
              <p class="custom-q__info-text">${renderRichText(q.text)}</p>
            </div>`;
            }
            if (q.type === 'scale') {
              const val = answers[q.id] ?? '';
              return `
            <div class="custom-q custom-q--scale">
              <label class="custom-q__label">${escapeHtml(q.text)}</label>
              <div class="custom-q__scale-row">
                <input type="range" name="a_${q.id}" min="0" max="10" step="1"
                  value="${val === '' ? 5 : Number(val)}" class="custom-q__range"
                  data-empty="${val === '' ? '1' : '0'}" />
                <output class="custom-q__scale-out">${val === '' ? '—' : Number(val)}</output>
              </div>
            </div>`;
            }
            if (q.type === 'task') {
              const stored = answers[q.id] || {};
              const done = Boolean(stored.done);
              const comment = stored.comment || '';
              return `
            <div class="custom-q custom-q--task">
              <label class="custom-q__task-head">
                <input type="checkbox" name="a_${q.id}_done" ${done ? 'checked' : ''} />
                <span class="custom-q__label">${renderRichText(q.text)}</span>
              </label>
              <textarea name="a_${q.id}_comment" rows="2" class="input"
                placeholder="¿Cómo fue? Dificultades, aprendizajes…">${escapeHtml(comment)}</textarea>
            </div>`;
            }
            if (q.type === 'text') {
              const val = answers[q.id] || '';
              return `
            <div class="custom-q custom-q--text">
              <label class="custom-q__label">${escapeHtml(q.text)}</label>
              <textarea name="a_${q.id}" rows="3" class="input">${escapeHtml(val)}</textarea>
            </div>`;
            }
            const selected = Array.isArray(answers[q.id]) ? answers[q.id] : [];
            return `
            <fieldset class="custom-q custom-q--choice">
              <legend class="custom-q__label">${escapeHtml(q.text)}</legend>
              ${(q.options || [])
                .map(
                  (opt, oi) => `
                <label class="custom-q__option">
                  <input type="checkbox" name="a_${q.id}" value="${escapeHtml(opt)}" ${selected.includes(opt) ? 'checked' : ''} />
                  <span>${escapeHtml(opt)}</span>
                </label>`,
                )
                .join('')}
            </fieldset>`;
          })
          .join('')}
      </form>
    </div>`;

  const persist = async () => {
    const form = host.querySelector('form');
    const next = { answers: {} };
    def.questions.forEach((q) => {
      if (q.type === 'info') return;
      if (q.type === 'scale') {
        const el = form.querySelector(`[name="a_${q.id}"]`);
        next.answers[q.id] = el?.dataset.empty === '1' ? '' : Number(el?.value ?? 0);
      } else if (q.type === 'task') {
        next.answers[q.id] = {
          done: Boolean(form.querySelector(`[name="a_${q.id}_done"]`)?.checked),
          comment: form.querySelector(`[name="a_${q.id}_comment"]`)?.value || '',
        };
      } else if (q.type === 'text') {
        next.answers[q.id] = form.querySelector(`[name="a_${q.id}"]`)?.value || '';
      } else {
        next.answers[q.id] = [...form.querySelectorAll(`[name="a_${q.id}"]:checked`)].map(
          (el) => el.value,
        );
      }
    });
    const fresh = await getModule(moduleRow.id);
    await syncModuleReadableText(fresh || moduleRow, next);
  };

  // La escala arranca en 5 sin puntuar: al primer movimiento pasa a contar.
  host.querySelectorAll('.custom-q__range').forEach((range) => {
    const out = range.parentElement?.querySelector('.custom-q__scale-out');
    range.addEventListener('input', () => {
      range.dataset.empty = '0';
      if (out) out.textContent = range.value;
    });
  });

  bindAutoSave(host.querySelector('form'), persist, workspaceAutoSaveStatus());
}

export function isCustomQuestionnaireType(moduleType) {
  return Boolean(parseCustomModuleType(moduleType));
}
