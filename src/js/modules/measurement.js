import { bindAutoSave, collectFormData } from '../autobind.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, parseJsonSafe } from '../utils.js';
import { workspaceAutoSaveStatus } from '../save-status.js';
import { moduleDisplayLabel } from '../custom-modules.js';

const today = () => new Date().toISOString().slice(0, 10);

/** Mediciones clínicas simples. La asociación con el eje vive en elementIds. */
export async function renderMeasurement(host, moduleRow, ctx = {}) {
  const data = parseJsonSafe(moduleRow.data, {});
  const quantitative = moduleRow.module_type === 'medicion_cuantitativa';
  const title = quantitative ? 'Medición cuantitativa' : 'Medición cualitativa';
  host.innerHTML = `
    <div class="card tcc-module measurement-module">
      <div class="module-card-head"><div><h2 class="module-title">${title}</h2><p class="module-card-head__sub">${quantitative ? 'Registra un resultado numérico o porcentaje.' : 'Registra una observación clínica fechada.'}</p></div></div>
      <form id="measurement-form-${moduleRow.id}">
        <label class="measurement-module__field"><span class="measurement-module__label">Título de la medición</span><input class="input" name="measurement_title" required placeholder="Ej.: Días de cumplimiento de actividades" value="${escapeHtml(data.measurement_title || '')}" /></label>
        <label class="measurement-module__field"><span class="measurement-module__label">Fecha</span><input class="input" type="date" name="date" value="${escapeHtml(data.date || today())}" /></label>
        ${quantitative ? `<div class="measurement-module__numbers"><label class="measurement-module__field"><span class="measurement-module__label">Valor</span><input class="input" type="number" step="any" name="value" value="${escapeHtml(data.value ?? '')}" /></label><label class="measurement-module__field"><span class="measurement-module__label">Unidad</span><select class="input" name="unit"><option value="número" ${data.unit === 'número' ? 'selected' : ''}>Número</option><option value="%" ${data.unit === '%' ? 'selected' : ''}>Porcentaje (%)</option></select></label></div>` : `<label class="measurement-module__field"><span class="measurement-module__label">Registro del evento</span><textarea class="input" name="note" rows="6" required placeholder="Observación clínica o evento…">${escapeHtml(data.note || '')}</textarea></label>`}
      </form>
    </div>`;
  const form = host.querySelector(`#measurement-form-${moduleRow.id}`);
  bindAutoSave(form, async () => {
    const payload = collectFormData(form);
    payload.elementIds = Array.isArray(data.elementIds) ? data.elementIds.map(String) : [];
    if (quantitative && payload.value !== '') payload.value = Number(payload.value);
    await syncModuleReadableText(moduleRow, payload, 'completado');
    const label = moduleDisplayLabel(moduleRow.module_type, payload);
    const separator = label.indexOf(' - ');
    const labelHtml = separator < 0
      ? escapeHtml(label)
      : `${escapeHtml(label.slice(0, separator))}<span class="module-link__label-detail">${escapeHtml(label.slice(separator))}</span>`;
    document.querySelectorAll(`[data-module-id="${moduleRow.id}"] .module-link__label`).forEach((node) => { node.innerHTML = labelHtml; });
  }, workspaceAutoSaveStatus());
}
