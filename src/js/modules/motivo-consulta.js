import { syncModuleReadableText } from '../readable-text.js';
import { bindAutoSave } from '../autobind.js';
import { workspaceAutoSaveStatus } from '../save-status.js';
import { escapeHtml, parseJsonSafe } from '../utils.js';

export async function renderMotivoConsulta(host, moduleRow) {
  const data = parseJsonSafe(moduleRow.data);

  host.innerHTML = `
    <div class="card">
      <h2 class="module-title">Motivo de consulta</h2>
      <form id="form-motivo">
        <div class="form-group" style="margin-bottom:16px">
          <label>Motivo principal</label>
          <textarea name="motivo" id="motivo-text" rows="4" placeholder="Describa el motivo de consulta...">${escapeHtml(data.motivo || '')}</textarea>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-reorder-motivo" style="margin-top:10px" title="Próximamente con IA local">Reordenar texto con IA</button>
        </div>
        <div class="form-group" style="margin-bottom:16px">
          <label>Expectativas del tratamiento</label>
          <textarea name="expectativas" rows="3">${escapeHtml(data.expectativas || '')}</textarea>
        </div>
        <div class="form-group" style="margin-bottom:16px">
          <label>Antecedentes relevantes</label>
          <textarea name="antecedentes" rows="3">${escapeHtml(data.antecedentes || '')}</textarea>
        </div>
        <div class="form-group" style="margin-bottom:16px">
          <label>Urgencia / prioridad</label>
          <select name="urgencia">
            <option value="baja" ${data.urgencia === 'baja' ? 'selected' : ''}>Baja</option>
            <option value="media" ${data.urgencia === 'media' ? 'selected' : ''}>Media</option>
            <option value="alta" ${data.urgencia === 'alta' ? 'selected' : ''}>Alta</option>
          </select>
        </div>
      </form>
    </div>`;

  const persist = async () => {
    const fd = new FormData(host.querySelector('#form-motivo'));
    const payload = Object.fromEntries(fd.entries());
    await syncModuleReadableText(moduleRow, payload, 'completado');
  };

  bindAutoSave(host.querySelector('#form-motivo'), persist, workspaceAutoSaveStatus());

  host.querySelector('#btn-reorder-motivo')?.addEventListener('click', () => {
    /* Reservado para IA local — sin servicio aún */
  });
}
