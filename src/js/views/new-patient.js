import { createTreatment, upsertPatient } from '../db.js';
import { openTreatmentWorkspace } from '../navigate.js';
import { escapeHtml, toast } from '../utils.js';

export function renderNewPatient(container, { onNavigate }) {
  container.innerHTML = `
    <div class="app-shell">
      <main class="app-main app-content" style="max-width:560px;margin:0 auto">
        <button class="btn btn-ghost" data-back>← Volver</button>
        <h1>Nuevo paciente / tratamiento</h1>
        <form id="form-new-patient" class="card" style="margin-top:16px">
          <div class="form-group" style="margin-bottom:12px">
            <label>Nombre</label>
            <input name="name" required />
          </div>
          <div class="form-group" style="margin-bottom:12px">
            <label>RUT / ID</label>
            <input name="id_number" />
          </div>
          <button type="submit" class="btn btn-primary">Crear y abrir ficha</button>
        </form>
      </main>
    </div>`;

  container.querySelector('[data-back]')?.addEventListener('click', () => onNavigate({ view: 'agenda' }));

  container.querySelector('#form-new-patient')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const patientId = await upsertPatient({
      name: fd.get('name'),
      id_number: fd.get('id_number'),
      gender: 'femenino',
      occupations: [],
    });
    const treatmentId = await createTreatment(patientId);
    toast('Tratamiento creado');
    await openTreatmentWorkspace(treatmentId, onNavigate);
  });
}
