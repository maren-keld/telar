import { confirmClinicalAiSend } from '../ai-clinical-send.js';
import { chatCompletion } from '../ai-client.js';
import { syncModuleReadableText } from '../readable-text.js';
import { bindAutoSave } from '../autobind.js';
import { workspaceAutoSaveStatus } from '../save-status.js';
import { ICON_WAND } from '../icons.js';
import { escapeHtml, parseJsonSafe, toast } from '../utils.js';

export const IA_ANAMNESIS_PROMPTS = [
  { key: 'ia_pregunto', n: '01', q: '¿Qué preguntaste?' },
  { key: 'ia_compartio', n: '02', q: '¿Qué compartiste?' },
  { key: 'ia_respondio', n: '03', q: '¿Qué te respondió?' },
  { key: 'ia_hizo', n: '04', q: '¿Qué hiciste con eso?' },
  { key: 'ia_lugar', n: '05', q: '¿Qué lugar ocupa ahora?' },
];

export const IA_ANAMNESIS_PLACEHOLDER = IA_ANAMNESIS_PROMPTS.map((p) => p.q).join('\n');

/** Un solo campo; si solo hay respuestas viejas por pregunta, las junta. */
export function relacionIaDisplay(data = {}) {
  const notes = String(data.relacion_ia || '').trim();
  if (notes) return notes;
  return IA_ANAMNESIS_PROMPTS.map((p) => {
    const v = String(data[p.key] || '').trim();
    return v ? `${p.q}\n${v}` : '';
  })
    .filter(Boolean)
    .join('\n\n');
}

export const URGENCIA_HINT = {
  baja: 'Malestar que no limita de forma grave el funcionamiento; puede esperar a la siguiente sesión habitual.',
  media: 'Interferencia clara en el día a día o riesgo emocional relevante, sin emergencia inmediata.',
  alta: 'Riesgo de daño (ideas de muerte, descompensación, violencia) o necesidad de intervenir en esta sesión / derivar.',
};

function reorderButtonHtml() {
  return `
    <button type="button" class="btn btn-secondary btn-sm btn-ai-reorder" data-reorder-anamnesis data-botonera-extra>
      <span class="btn-ai-reorder__label">
        ${ICON_WAND}
        <span class="btn-ai-reorder__text">Reorganizar con IA</span>
      </span>
      <span class="btn-ai-reorder__orb" hidden></span>
    </button>`;
}

export function stripAiFences(text) {
  return String(text || '')
    .replace(/^```[\w]*\s*/u, '')
    .replace(/\s*```$/u, '')
    .replace(/^["«]|["»]$/g, '')
    .trim();
}

export function parseAnamnesisJson(raw) {
  const cleaned = stripAiFences(raw);
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    const motivo = String(obj.motivo || '').trim();
    const expectativas = String(obj.expectativas || '').trim();
    const antecedentes = String(obj.antecedentes || '').trim();
    if (!motivo && !expectativas && !antecedentes) return null;
    return { motivo, expectativas, antecedentes };
  } catch {
    return null;
  }
}

export async function reorganizeAnamnesis({ motivo, expectativas, antecedentes }) {
  const system = `Eres un editor clínico. Redistribuyes texto ya escrito por el terapeuta entre tres campos de anamnesis, sin diagnosticar ni inventar.

Campos:
- motivo: tercera persona, breve (2–5 frases). Solo el motivo de consulta presentable: qué trae a la persona y el malestar principal. Nada de historia larga ni expectativas.
- expectativas: tercera persona. Qué espera del tratamiento.
- antecedentes: primera persona (voz del paciente). Historia, contexto y hechos relevantes que no son el motivo acotado.

Reglas:
- No agregues hechos, hipótesis ni vocabulario que no esté en el texto.
- No quites información: muévela al campo que le corresponde.
- Puedes corregir ortografía leve.
- Devuelve SOLO un JSON con las claves motivo, expectativas y antecedentes. Sin markdown.`;

  const { text } = await chatCompletion({
    maxTokens: 1200,
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        content: `Motivo actual:\n${motivo || '—'}\n\nExpectativas actuales:\n${expectativas || '—'}\n\nAntecedentes actuales:\n${antecedentes || '—'}`,
      },
    ],
  });
  const parsed = parseAnamnesisJson(text);
  if (!parsed) throw new Error('La IA no devolvió los tres campos.');
  return parsed;
}

export async function renderMotivoConsulta(host, moduleRow) {
  const data = parseJsonSafe(moduleRow.data);
  const urgencia = data.urgencia === 'alta' || data.urgencia === 'baja' ? data.urgencia : 'media';

  host.innerHTML = `
    <div class="card">
      <div class="form-group-head module-anamnesis-head">
        <div>
          <h2 class="module-title">Anamnesis</h2>
          <p class="module-title-hint">Anamnesis de la primera sesión: el motivo queda acotado para presentar el caso; antecedentes y expectativas se separan abajo.</p>
        </div>
        ${reorderButtonHtml()}
      </div>
      <form id="form-motivo">
        <div class="form-group" style="margin-bottom:16px">
          <label for="motivo-text">Motivo principal</label>
          <textarea name="motivo" id="motivo-text" rows="4" placeholder="Qué trae a la persona, en breve…">${escapeHtml(data.motivo || '')}</textarea>
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
          <label for="motivo-tratamientos">Tratamientos previos</label>
          <textarea name="tratamientos_previos" id="motivo-tratamientos" rows="3" placeholder="Terapias, hospitalizaciones; qué sirvió y qué no.">${escapeHtml(data.tratamientos_previos || '')}</textarea>
        </div>
        <div class="anamnesis-pair">
          <div class="form-group" style="margin-bottom:0">
            <label for="motivo-medicacion">Medicación</label>
            <textarea name="medicacion" id="motivo-medicacion" rows="2" placeholder="Fármaco, dosis, adherencia">${escapeHtml(data.medicacion || '')}</textarea>
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label for="motivo-psiquiatra">Psiquiatra / médico tratante</label>
            <textarea name="psiquiatra" id="motivo-psiquiatra" rows="2" placeholder="Quién indica, especialidad, contacto">${escapeHtml(data.psiquiatra || '')}</textarea>
          </div>
        </div>
        <div class="form-group" style="margin-bottom:16px">
          <label for="motivo-consumo">Consumo</label>
          <input type="text" name="consumo" id="motivo-consumo" placeholder="Alcohol, cannabis, estimulantes…" value="${escapeHtml(data.consumo || '')}" />
        </div>
        <div class="form-group" style="margin-bottom:16px">
          <label for="motivo-salud-fisica">Salud física / factores orgánicos</label>
          <textarea name="salud_fisica" id="motivo-salud-fisica" rows="3" placeholder="tiroides, anemia, vitamina D, B12, sueño, dolor, últimos exámenes; si está en control médico.">${escapeHtml(data.salud_fisica || '')}</textarea>
        </div>
        <div class="form-group anamnesis-ia" style="margin-bottom:16px">
          <label for="motivo-relacion-ia">Relación con la IA</label>
          <p class="form-hint">Cómo se lleva con chatbots (ChatGPT y similares). Recorre las cinco preguntas.</p>
          <textarea name="relacion_ia" id="motivo-relacion-ia" rows="8" placeholder="${escapeHtml(IA_ANAMNESIS_PLACEHOLDER)}">${escapeHtml(relacionIaDisplay(data))}</textarea>
        </div>
        <div class="form-group" style="margin-bottom:16px">
          <label for="motivo-urgencia">Urgencia / prioridad</label>
          <select name="urgencia" id="motivo-urgencia">
            <option value="baja" ${urgencia === 'baja' ? 'selected' : ''}>Baja</option>
            <option value="media" ${urgencia === 'media' ? 'selected' : ''}>Media</option>
            <option value="alta" ${urgencia === 'alta' ? 'selected' : ''}>Alta</option>
          </select>
          <p class="form-hint" id="motivo-urgencia-hint">${escapeHtml(URGENCIA_HINT[urgencia])}</p>
        </div>
      </form>
    </div>`;

  const form = host.querySelector('#form-motivo');
  const urgenciaHint = host.querySelector('#motivo-urgencia-hint');
  const urgenciaSelect = form.querySelector('[name="urgencia"]');

  urgenciaSelect?.addEventListener('change', () => {
    const v = urgenciaSelect.value;
    if (urgenciaHint) urgenciaHint.textContent = URGENCIA_HINT[v] || URGENCIA_HINT.media;
  });

  const persist = async () => {
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    for (const p of IA_ANAMNESIS_PROMPTS) payload[p.key] = '';
    await syncModuleReadableText(moduleRow, payload, 'completado');
  };

  bindAutoSave(form, persist, workspaceAutoSaveStatus());

  form.closest('.card')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-reorder-anamnesis]');
    if (!btn || btn.disabled) return;
    e.preventDefault();
    e.stopPropagation();

    const motivo = String(form.querySelector('[name="motivo"]')?.value || '').trim();
    const expectativas = String(form.querySelector('[name="expectativas"]')?.value || '').trim();
    const antecedentes = String(form.querySelector('[name="antecedentes"]')?.value || '').trim();
    if (!motivo && !expectativas && !antecedentes) {
      toast('Escribe algo en motivo, expectativas o antecedentes antes de reorganizar.');
      form.querySelector('[name="motivo"]')?.focus();
      return;
    }

    const textEl = btn.querySelector('.btn-ai-reorder__text');
    const orbHost = btn.querySelector('.btn-ai-reorder__orb');
    let stopOrb = () => {};

    try {
      await confirmClinicalAiSend({
        contextText: [motivo, expectativas, antecedentes].filter(Boolean).join('\n\n'),
        purpose: 'Reorganizar motivo, expectativas y antecedentes',
      });

      btn.disabled = true;
      btn.dataset.busy = '1';
      if (textEl) textEl.textContent = 'Reorganizando…';
      if (orbHost) orbHost.hidden = false;
      try {
        const { mountThinkingOrb } = await import('../thinking-orb.js');
        stopOrb = mountThinkingOrb(orbHost, { state: 'working', size: 20 });
      } catch {
        stopOrb = () => {};
      }

      toast('Reorganizando con IA…');
      const next = await reorganizeAnamnesis({ motivo, expectativas, antecedentes });
      const setVal = (name, value) => {
        const el = form.querySelector(`[name="${name}"]`);
        if (el) el.value = value;
      };
      setVal('motivo', next.motivo);
      setVal('expectativas', next.expectativas);
      setVal('antecedentes', next.antecedentes);
      await persist();
      toast('Anamnesis reorganizada');
    } catch (err) {
      const msg = err?.message || 'No se pudo reorganizar el texto.';
      if (!/cancelado/i.test(msg)) toast(msg);
    } finally {
      stopOrb();
      btn.dataset.busy = '';
      btn.disabled = false;
      if (textEl) textEl.textContent = 'Reorganizar con IA';
      if (orbHost) {
        orbHost.hidden = true;
        orbHost.replaceChildren();
      }
    }
  });
}
