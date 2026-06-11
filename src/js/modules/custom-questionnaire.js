import { bindAutoSave } from '../autobind.js';
import { getCustomModuleByType, parseCustomModuleType } from '../custom-modules.js';
import { getModule, saveModuleData } from '../db.js';
import { escapeHtml, parseJsonSafe } from '../utils.js';
import { workspaceAutoSaveStatus } from '../save-status.js';

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
      ${def.instructions ? `<p class="custom-questionnaire__instructions">${escapeHtml(def.instructions)}</p>` : ''}
      <form id="form-custom-${customId}" class="custom-questionnaire__form">
        ${def.questions
          .map((q, qi) => {
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
      if (q.type === 'text') {
        next.answers[q.id] = form.querySelector(`[name="a_${q.id}"]`)?.value || '';
      } else {
        next.answers[q.id] = [...form.querySelectorAll(`[name="a_${q.id}"]:checked`)].map(
          (el) => el.value,
        );
      }
    });
    const fresh = await getModule(moduleRow.id);
    await saveModuleData(moduleRow.id, { ...parseJsonSafe(fresh?.data, {}), ...next });
  };

  bindAutoSave(host.querySelector('form'), persist, workspaceAutoSaveStatus());
}

export function isCustomQuestionnaireType(moduleType) {
  return Boolean(parseCustomModuleType(moduleType));
}
