import { bindAutoSave } from '../autobind.js';
import { syncModuleReadableText } from '../readable-text.js';
import { workspaceAutoSaveStatus } from '../save-status.js';
import { escapeHtml, parseJsonSafe } from '../utils.js';

export async function renderNotaSesion(host, moduleRow) {
  const data = parseJsonSafe(moduleRow.data, {});

  host.innerHTML = `
    <div class="card">
      <h2 class="module-title">Nota de sesión</h2>
      <p class="module-title-hint">Para horas sin instrumento. La bitácora del panel derecho sigue siendo para comentarios sobre el caso.</p>
      <form id="form-nota-sesion">
        <div class="form-group">
          <textarea name="nota" id="nota-sesion-text" rows="10" placeholder="Qué ocurrió en esta hora, en breve…">${escapeHtml(data.nota || '')}</textarea>
        </div>
      </form>
    </div>`;

  const form = host.querySelector('#form-nota-sesion');
  const persist = async () => {
    const fd = new FormData(form);
    await syncModuleReadableText(moduleRow, { nota: String(fd.get('nota') || '') }, 'completado');
  };

  bindAutoSave(form, persist, workspaceAutoSaveStatus());
}
