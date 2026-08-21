import { bindAutoSave, collectFormData, formPayload } from '../autobind.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, parseJsonSafe } from '../utils.js';
import { workspaceAutoSaveStatus } from '../save-status.js';

const SECTIONS = [
  {
    key: 'activador',
    title: 'Evento activador',
    hint: '¿Cómo es el contexto antes de que esto suceda? (Ej. antes de dormir, cuando estoy solo/a en mi hogar, sentado en mi oficina, etc.).',
  },
  {
    key: 'creencias',
    title: 'Creencias',
    hint: 'Creencias sobre el evento. Implica pensamientos obvios y subyacentes sobre situaciones, usted mismo y los demás.',
  },
  {
    key: 'consecuencias',
    title: 'Consecuencias',
    hint: 'Comportamiento, pensamientos y respuesta emocional (motivado, feliz, contento, relajado, fatigado, triste, molesto y/o nervioso).',
  },
];

export async function renderTccAbc(host, moduleRow) {
  const data = parseJsonSafe(moduleRow.data, {});

  host.innerHTML = `
    <div class="card tcc-module">
      <div class="module-card-head">
        <div>
          <h2 class="module-title" style="margin:0">Modelo ABC (versión simple)</h2>
          <p class="module-card-head__sub">Material TCC Telar — elaboración propia</p>
        </div>
      </div>
      <p class="tcc-intro">
        El modelo ABC es una herramienta que tiene como objetivo explorar pensamientos, emociones, conductas y
        creencias antes, durante y luego de una situación desagradable o de dificultad.
      </p>
      <form id="tcc-abc-form">
        ${SECTIONS.map(
          (s) => `
        <div class="form-group tcc-section">
          <label for="tcc-abc-${s.key}">${escapeHtml(s.title)}</label>
          <p class="tcc-section__hint">${escapeHtml(s.hint)}</p>
          <textarea id="tcc-abc-${s.key}" name="${s.key}" rows="4" placeholder="Escriba aquí…">${escapeHtml(data[s.key] || '')}</textarea>
        </div>`,
        ).join('')}
      </form>
    </div>`;

  const persist = async () => {
    const form = host.querySelector('#tcc-abc-form');
    if (!form?.isConnected) return;
    await syncModuleReadableText(moduleRow, formPayload(collectFormData(form)), 'completado');
  };

  bindAutoSave(host.querySelector('#tcc-abc-form'), persist, workspaceAutoSaveStatus());
}
