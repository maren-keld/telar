import { bindAutoSave, collectFormData } from '../autobind.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, parseJsonSafe } from '../utils.js';
import { workspaceAutoSaveStatus } from '../save-status.js';

const SECTIONS = [
  {
    key: 'stress_situations',
    title: '1. Situaciones que puedan generar estrés',
    hint: 'Identifica las situaciones específicas que pueden causar estrés significativo (familiares, laborales u otras que te hagan sentir abrumado/a).',
  },
  {
    key: 'relief_strategies',
    title: '2. Estrategias que ayuden a aliviar el estrés',
    hint: 'Estrategias que te han ayudado en el pasado: ejercicio, meditación, hablar con amigos u otras técnicas de relajación.',
  },
  {
    key: 'distraction',
    title: '3. Personas y situaciones que ayuden a distraerse',
    hint: 'Personas con las que puedes hablar o actividades que puedes hacer para distraerte y sentirte mejor (sin explicitar ideación suicida).',
  },
  {
    key: 'suicide_contacts',
    title: '4. Personas a contactar si necesitas hablar de ideación suicida',
    hint: 'Nombres y contactos de personas de confianza: amigos, familiares o profesionales de la salud.',
  },
  {
    key: 'crisis_services',
    title: '5. Profesional o servicios de salud en caso de crisis',
    hint: 'Servicios de salud y profesionales a los que puedes acudir. Incluye direcciones y números de teléfono.',
  },
  {
    key: 'safe_environment',
    title: '6. Indicaciones para un ambiente seguro',
    hint: 'Cómo hacer tu entorno más seguro: eliminar o asegurar objetos peligrosos y plan para evitar situaciones de riesgo.',
  },
];

export async function renderTccPlanSeguridad(host, moduleRow) {
  const data = parseJsonSafe(moduleRow.data, {});

  host.innerHTML = `
    <div class="card tcc-module">
      <h2 class="module-title">Plan de seguridad vital</h2>
      <p class="tcc-intro">
        Este módulo ayuda a identificar y gestionar situaciones de crisis y a mantenerse seguro/a. Es una herramienta
        importante para cualquier persona que pueda estar en riesgo de suicidio o que experimente momentos de gran estrés.
      </p>
      <p class="tcc-warning" role="note">
        Herramienta de apoyo clínico. La evaluación de riesgo vital y las decisiones de seguridad son responsabilidad
        exclusiva del profesional de la salud mental.
      </p>
      <form id="tcc-plan-form">
        ${SECTIONS.map(
          (s) => `
        <div class="form-group tcc-section">
          <label for="tcc-plan-${s.key}">${escapeHtml(s.title)}</label>
          <p class="tcc-section__hint">${escapeHtml(s.hint)}</p>
          <textarea id="tcc-plan-${s.key}" name="${s.key}" rows="4" placeholder="Escriba aquí…">${escapeHtml(data[s.key] || '')}</textarea>
        </div>`,
        ).join('')}
      </form>
    </div>`;

  const persist = async () => {
    const fd = collectFormData(host.querySelector('#tcc-plan-form'));
    await syncModuleReadableText(moduleRow, Object.fromEntries(fd.entries()), 'completado');
  };

  bindAutoSave(host.querySelector('#tcc-plan-form'), persist, workspaceAutoSaveStatus());
}
