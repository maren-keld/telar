import { bindAutoSave, collectFormData } from '../autobind.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, parseJsonSafe } from '../utils.js';
import { workspaceAutoSaveStatus } from '../save-status.js';

const MIN = 1;
const MAX = 100;

/**
 * Escala subjetiva 1–100 (ánimo o ansiedad).
 * @param {{ title: string, subtitle: string, field: string }} meta
 */
export async function renderSubjectiveScale(host, moduleRow, meta) {
  const data = parseJsonSafe(moduleRow.data, {});
  const raw = data[meta.field];
  const value = raw === null || raw === undefined || raw === '' ? '' : Number(raw);
  const display = value === '' || Number.isNaN(value) ? '' : String(Math.min(MAX, Math.max(MIN, value)));

  host.innerHTML = `
    <div class="card subjective-scale-module">
      <div class="module-card-head">
        <div>
          <h2 class="module-title" style="margin:0">${escapeHtml(meta.title)}</h2>
          <p class="module-card-head__sub">${escapeHtml(meta.subtitle)}</p>
        </div>
      </div>
      <form id="subjective-scale-form" class="subjective-scale">
        <label class="subjective-scale__box" for="subjective-value">
          <input
            id="subjective-value"
            name="${meta.field}"
            type="number"
            min="${MIN}"
            max="${MAX}"
            step="1"
            inputmode="numeric"
            value="${escapeHtml(display)}"
            placeholder="0"
            autocomplete="off"
          />
        </label>
        <p class="subjective-scale__range">De ${MIN} a ${MAX}</p>
      </form>
    </div>
  `;

  const form = host.querySelector('#subjective-scale-form');
  const input = form.querySelector('input');

  const persist = async () => {
    const fd = collectFormData(form);
    let v = fd[meta.field];
    if (v === undefined || v === '') {
      await syncModuleReadableText(moduleRow, { [meta.field]: null }, 'pendiente');
      return;
    }
    v = Math.round(Number(v));
    if (Number.isNaN(v)) return;
    v = Math.min(MAX, Math.max(MIN, v));
    input.value = String(v);
    await syncModuleReadableText(moduleRow, { [meta.field]: v }, 'completado');
  };

  bindAutoSave(form, persist, workspaceAutoSaveStatus());

  input.addEventListener('blur', () => {
    if (input.value === '') return;
    const v = Math.min(MAX, Math.max(MIN, Math.round(Number(input.value))));
    if (!Number.isNaN(v)) input.value = String(v);
  });
}
