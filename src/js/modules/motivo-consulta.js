import { confirmClinicalAiSend } from '../ai-clinical-send.js';
import { chatCompletion } from '../ai-client.js';
import { syncModuleReadableText } from '../readable-text.js';
import { bindAutoSave, queuedPersist } from '../autobind.js';
import { notifySaveError, workspaceAutoSaveStatus } from '../save-status.js';
import { ICON_STAR } from '../icons.js';
import { dispatchWorkspaceIndexMode } from '../workspace-index-mode.js';
import { escapeHtml, parseJsonSafe, toast } from '../utils.js';
import { loadProfile } from '../profile.js';
import { findMedications, medicationCountryLabel, medicationRegistry, PSYCHIATRIC_MEDICATIONS } from '../medication-catalog.js';

export const IA_ANAMNESIS_PROMPTS = [
  { key: 'ia_pregunto', n: '01', q: '¿Qué preguntaste?' },
  { key: 'ia_compartio', n: '02', q: '¿Qué compartiste?' },
  { key: 'ia_respondio', n: '03', q: '¿Qué te respondió?' },
  { key: 'ia_hizo', n: '04', q: '¿Qué hiciste con eso?' },
  { key: 'ia_lugar', n: '05', q: '¿Qué lugar ocupa ahora?' },
];

export const IA_ANAMNESIS_PLACEHOLDER = IA_ANAMNESIS_PROMPTS.map((p) => p.q).join(', ');

/** Las preguntas del placeholder se muestran en una frase separada por comas. */
export function iaAnamnesisPlaceholderAttr() {
  return escapeHtml(IA_ANAMNESIS_PLACEHOLDER);
}

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

/** Textareas que «Reorganizar con IA» lee y rellena (no consumo ni urgencia). */
export const ANAMNESIS_REORDER_FIELDS = [
  {
    key: 'motivo',
    label: 'Motivo principal',
    hint: 'tercera persona, breve (2–5 frases). Solo motivo de consulta: qué trae a la persona y el malestar principal.',
  },
  {
    key: 'expectativas',
    label: 'Expectativas del tratamiento',
    hint: 'tercera persona. Qué espera del tratamiento.',
  },
  {
    key: 'antecedentes',
    label: 'Antecedentes relevantes',
    hint: 'primera persona (voz del paciente). Historia, contexto y hechos relevantes que no son el motivo acotado.',
  },
  {
    key: 'tratamientos_previos',
    label: 'Tratamientos previos',
    hint: 'terapias, hospitalizaciones; qué sirvió y qué no.',
  },
  {
    key: 'medicacion',
    label: 'Medicación',
    hint: 'fármaco, dosis, adherencia.',
  },
  {
    key: 'psiquiatra',
    label: 'Psiquiatra / médico tratante',
    hint: 'quién indica, especialidad, contacto.',
  },
  {
    key: 'salud_fisica',
    label: 'Salud física / factores orgánicos',
    hint: 'tiroides, anemia, vitamina D, B12, sueño, dolor, últimos exámenes; control médico.',
  },
  {
    key: 'relacion_ia',
    label: 'Relación con la IA',
    hint: 'cómo se lleva con chatbots (ChatGPT y similares); las cinco preguntas del módulo si hay material.',
  },
];

export const ANAMNESIS_REORDER_KEYS = ANAMNESIS_REORDER_FIELDS.map((f) => f.key);

function reorderButtonHtml() {
  return `
    <button type="button" class="btn btn-secondary btn-sm btn-ai-reorder" data-reorder-anamnesis data-botonera-extra>
      <span class="btn-ai-reorder__label">
        ${ICON_STAR}
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

const OBJECT_STRING = '[object Object]';

/** Flatten IA JSON values to textarea text. Never writes `[object Object]`. */
export function stringifyAnamnesisValue(value, depth = 0) {
  if (value == null) return '';
  if (typeof value === 'string') {
    const text = value.trim();
    return text === OBJECT_STRING ? '' : text;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (depth > 5) return '';
  if (Array.isArray(value)) {
    return value
      .map((item) => stringifyAnamnesisValue(item, depth + 1))
      .filter(Boolean)
      .join('\n');
  }
  if (typeof value === 'object') {
    for (const key of ['text', 'content', 'value', 'body']) {
      if (key in value) {
        const inner = stringifyAnamnesisValue(value[key], depth + 1);
        if (inner) return inner;
      }
    }
    return Object.values(value)
      .map((item) => stringifyAnamnesisValue(item, depth + 1))
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function unwrapAnamnesisObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  if (ANAMNESIS_REORDER_KEYS.some((key) => key in obj)) return obj;
  for (const nested of Object.values(obj)) {
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const found = unwrapAnamnesisObject(nested);
      if (found) return found;
    }
  }
  return null;
}

function parseAnamnesisObject(obj) {
  const source = unwrapAnamnesisObject(obj);
  if (!source) return null;
  const parsed = {};
  for (const key of ANAMNESIS_REORDER_KEYS) {
    if (!(key in source)) continue;
    parsed[key] = stringifyAnamnesisValue(source[key]);
  }
  if (!Object.keys(parsed).length) return null;
  if (!ANAMNESIS_REORDER_KEYS.some((key) => parsed[key])) return null;
  return parsed;
}

export function parseAnamnesisJson(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return parseAnamnesisObject(raw);
  }
  const cleaned = stripAiFences(typeof raw === 'string' ? raw : stringifyAnamnesisValue(raw));
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1));
    return parseAnamnesisObject(obj);
  } catch {
    return null;
  }
}

export function anamnesisFieldSnapshot(form) {
  return Object.fromEntries(
    ANAMNESIS_REORDER_KEYS.map((key) => [
      key,
      String(form?.querySelector(`[name="${key}"]`)?.value || ''),
    ]),
  );
}

export function hasAnamnesisReorderInput(snapshot = {}) {
  return ANAMNESIS_REORDER_KEYS.some((key) => String(snapshot[key] || '').trim());
}

function anamnesisSnapshotsEqual(a, b) {
  return ANAMNESIS_REORDER_KEYS.every((key) => (a?.[key] ?? '') === (b?.[key] ?? ''));
}

/** No aplicar la IA si el form se desmontó, se reemplazó o el terapeuta siguió escribiendo. */
export function shouldApplyAnamnesisAi({ form, snapshot, generation } = {}) {
  if (!form?.isConnected) return { ok: false, reason: 'unmounted' };
  if (generation != null && form.dataset.anamnesisGeneration !== String(generation)) {
    return { ok: false, reason: 'replaced' };
  }
  const current = anamnesisFieldSnapshot(form);
  if (!anamnesisSnapshotsEqual(current, snapshot)) {
    return { ok: false, reason: 'diverged' };
  }
  return { ok: true };
}

export function anamnesisReorderUserMessage(fields = {}) {
  return ANAMNESIS_REORDER_FIELDS.map(
    ({ key, label }) => `${label} (${key}):\n${String(fields[key] || '').trim() || '—'}`,
  ).join('\n\n');
}

export function anamnesisReorderContextText(fields = {}) {
  return ANAMNESIS_REORDER_FIELDS.filter(({ key }) => String(fields[key] || '').trim())
    .map(({ label, key }) => `${label}:\n${String(fields[key]).trim()}`)
    .join('\n\n');
}

export async function reorganizeAnamnesis(fields) {
  const snapshot = fields || {};
  const fieldLines = ANAMNESIS_REORDER_FIELDS.map(
    ({ key, label, hint }) => `- ${key}: ${label}. ${hint}`,
  ).join('\n');
  const jsonKeys = ANAMNESIS_REORDER_KEYS.join(', ');
  const system = `Eres un editor clínico. Redistribuyes texto ya escrito por el terapeuta entre los campos de anamnesis, sin diagnosticar ni inventar.

Campos:
${fieldLines}

Reglas:
- No agregues hechos, hipótesis ni vocabulario que no esté en el texto.
- No quites información: muévela al campo que le corresponde.
- Puedes corregir ortografía leve.
- Cada valor del JSON debe ser un string (texto plano). Nunca un objeto ni un array.
- Devuelve SOLO un JSON con las claves ${jsonKeys}. Sin markdown.`;

  const { text } = await chatCompletion({
    maxTokens: 2000,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: anamnesisReorderUserMessage(snapshot) },
    ],
  });
  const parsed = parseAnamnesisJson(text);
  if (!parsed) throw new Error('La IA no devolvió los campos de anamnesis.');
  return parsed;
}

export async function renderMotivoConsulta(host, moduleRow, ctx = {}) {
  const data = parseJsonSafe(moduleRow.data);
  const urgencia = data.urgencia === 'alta' || data.urgencia === 'baja' ? data.urgencia : 'media';
  const savedMedicationTags = Array.isArray(data.medications)
    ? data.medications.filter((item) => item && typeof item.name === 'string')
    : [];
  const medicationTags = savedMedicationTags.length
    ? savedMedicationTags
    : String(data.medicacion || '').split(/\n|;/).map((name) => name.trim()).filter(Boolean)
      .map((name) => ({ name, use: PSYCHIATRIC_MEDICATIONS.find((item) => item.name.toLowerCase() === name.toLowerCase())?.use || 'Indicación por registrar' }));
  const country = loadProfile().clinicCountry;
  const countryLabel = medicationCountryLabel(country);
  const registry = medicationRegistry(country);

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
          <textarea name="expectativas" rows="3" placeholder="Qué espera lograr con el tratamiento…">${escapeHtml(data.expectativas || '')}</textarea>
        </div>
        <div class="form-group" style="margin-bottom:16px">
          <label>Antecedentes relevantes</label>
          <textarea name="antecedentes" rows="3" placeholder="Historia y contexto relevantes para comprender el motivo de consulta…">${escapeHtml(data.antecedentes || '')}</textarea>
        </div>
        <div class="form-group" style="margin-bottom:16px">
          <label for="motivo-tratamientos">Tratamientos previos</label>
          <textarea name="tratamientos_previos" id="motivo-tratamientos" rows="3" placeholder="Terapias, hospitalizaciones; qué sirvió y qué no.">${escapeHtml(data.tratamientos_previos || '')}</textarea>
        </div>
          <div class="form-group" style="margin-bottom:16px">
            <label for="motivo-medicacion">Medicación</label>
            <div class="medication-picker">
              <div class="medication-picker__tags" data-medication-tags></div>
              <input type="search" id="motivo-medicacion" autocomplete="off" placeholder="Buscar medicamento y añadir…" aria-label="Buscar medicamento" aria-controls="medication-options" aria-expanded="false" />
              <div id="medication-options" class="medication-picker__options" role="listbox" hidden></div>
              <input type="hidden" name="medicacion" value="" />
              <p class="form-hint">Nombres genéricos en ${escapeHtml(countryLabel)}. ${registry ? `<a href="${registry.url}" target="_blank" rel="noopener noreferrer">Consulta productos en ${registry.label}</a>.` : 'Verifica el producto en el registro sanitario de tu país.'} Los usos son orientativos.</p>
            </div>
          </div>
          <div class="form-group" style="margin-bottom:16px">
            <label for="motivo-psiquiatra">Psiquiatra / médico tratante</label>
            <textarea name="psiquiatra" id="motivo-psiquiatra" rows="2" placeholder="Quién indica, especialidad, contacto">${escapeHtml(data.psiquiatra || '')}</textarea>
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
          <textarea name="relacion_ia" id="motivo-relacion-ia" class="anamnesis-ia__field" rows="6" data-no-autoresize placeholder="${iaAnamnesisPlaceholderAttr()}">${escapeHtml(relacionIaDisplay(data))}</textarea>
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
        <div class="anamnesis-case-study-action">
          <button type="button" class="btn btn-secondary btn-block" data-autocomplete-case-study>Autocompletar ejes del caso con IA</button>
          <p class="form-hint">Usa esta anamnesis y los registros iniciales para proponer elementos con evidencia textual.</p>
        </div>
      </form>
    </div>`;

  const form = host.querySelector('#form-motivo');
  const urgenciaHint = host.querySelector('#motivo-urgencia-hint');
  const urgenciaSelect = form.querySelector('[name="urgencia"]');
  const medicationInput = form.querySelector('#motivo-medicacion');
  const medicationOptions = form.querySelector('#medication-options');
  const medicationTagsHost = form.querySelector('[data-medication-tags]');
  const medicationHidden = form.querySelector('[name="medicacion"]');
  const medicationPicker = medicationInput.closest('.medication-picker');
  const hideMedicationOptions = () => {
    medicationOptions.hidden = true;
    medicationInput.setAttribute('aria-expanded', 'false');
  };
  const pickerEvents = new AbortController();
  const pickerObserver = new MutationObserver(() => {
    if (!form.isConnected) {
      pickerEvents.abort();
      pickerObserver.disconnect();
    }
  });
  pickerObserver.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('pointerdown', (event) => {
    if (!medicationPicker.contains(event.target)) hideMedicationOptions();
  }, { signal: pickerEvents.signal });
  medicationPicker.addEventListener('focusout', (event) => {
    if (!medicationPicker.contains(event.relatedTarget)) hideMedicationOptions();
  });
  // Mantiene el input enfocado durante la selección para que el focusout no
  // cierre el listbox antes del click (comportamiento variable entre Windows/macOS).
  medicationOptions.addEventListener('mousedown', (event) => {
    if (event.target.closest('[role="option"]')) event.preventDefault();
  });

  const renderMedicationTags = () => {
    medicationHidden.value = medicationTags.map((item) => `${item.name} — ${item.use}`).join('; ');
    medicationTagsHost.innerHTML = medicationTags.map((item, index) => `
      <span class="medication-tag"><span><strong>${escapeHtml(item.name)}</strong><small>Uso habitual: ${escapeHtml(item.use)}</small></span>
      <button type="button" data-remove-medication="${index}" aria-label="Quitar ${escapeHtml(item.name)}">×</button></span>`).join('');
  };
  const showMedicationOptions = () => {
    const term = medicationInput.value.trim();
    const found = findMedications(term, medicationTags).slice(0, 10);
    medicationOptions.innerHTML = found.map((item) => `
      <button type="button" role="option" data-medication="${escapeHtml(item.name)}"><strong>${escapeHtml(item.name)}</strong><small>Uso habitual: ${escapeHtml(item.use)}</small></button>`).join('') ||
      (term ? `<button type="button" role="option" data-medication-custom="${escapeHtml(term)}">Añadir «${escapeHtml(term)}»</button>` : '');
    medicationOptions.hidden = !medicationOptions.innerHTML;
    medicationInput.setAttribute('aria-expanded', String(!medicationOptions.hidden));
  };
  const addMedication = (item) => {
    if (!item || medicationTags.some((tag) => tag.name.toLowerCase() === item.name.toLowerCase())) return;
    medicationTags.push(item);
    medicationInput.value = '';
    hideMedicationOptions();
    renderMedicationTags();
    medicationHidden.dispatchEvent(new Event('change', { bubbles: true }));
    medicationInput.focus();
    hideMedicationOptions();
    void persist().catch((error) => notifySaveError(error));
  };
  renderMedicationTags();
  medicationInput.addEventListener('focus', showMedicationOptions);
  medicationInput.addEventListener('input', showMedicationOptions);
  medicationInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hideMedicationOptions();
    if (event.key === 'Enter' && !medicationOptions.hidden) {
      event.preventDefault();
      medicationOptions.querySelector('button')?.click();
    }
  });
  medicationOptions.addEventListener('click', (event) => {
    const button = event.target.closest('[data-medication], [data-medication-custom]');
    if (!button || !medicationOptions.contains(button)) return;
    const name = button.dataset.medication || button.dataset.medicationCustom;
    addMedication(
      PSYCHIATRIC_MEDICATIONS.find((item) => item.name === name)
        || { name, use: 'Indicación por registrar' },
    );
  });
  medicationTagsHost.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-medication]');
    if (!button) return;
    medicationTags.splice(Number(button.dataset.removeMedication), 1);
    renderMedicationTags();
    medicationHidden.dispatchEvent(new Event('change', { bubbles: true }));
    void persist().catch((error) => notifySaveError(error));
  });

  urgenciaSelect?.addEventListener('change', () => {
    const v = urgenciaSelect.value;
    if (urgenciaHint) urgenciaHint.textContent = URGENCIA_HINT[v] || URGENCIA_HINT.media;
  });

  const persistRaw = async () => {
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    payload.medications = medicationTags.map((item) => ({ ...item }));
    for (const p of IA_ANAMNESIS_PROMPTS) payload[p.key] = '';
    await syncModuleReadableText(moduleRow, payload, 'completado');
  };
  const persist = queuedPersist(persistRaw, notifySaveError);

  bindAutoSave(form, persistRaw, workspaceAutoSaveStatus());

  const generation = String(Date.now());
  form.dataset.anamnesisGeneration = generation;
  const lockReorderFields = (locked) => {
    for (const name of ANAMNESIS_REORDER_KEYS) {
      const el = form.querySelector(`[name="${name}"]`);
      if (el) el.readOnly = locked;
    }
  };

  host.addEventListener('click', async (e) => {
    const caseStudyBtn = e.target.closest('[data-autocomplete-case-study]');
    if (caseStudyBtn && host.contains(caseStudyBtn)) {
      e.preventDefault();
      if (caseStudyBtn.disabled) return;
      const original = caseStudyBtn.textContent;
      try {
        caseStudyBtn.disabled = true;
        caseStudyBtn.textContent = 'Guardando y analizando…';
        await persist();
        const { autoCompleteCaseStudyWithAi } = await import('../case-study-ai.js');
        const treatmentId = ctx.treatment?.id;
        if (!treatmentId) throw new Error('No se encontró el tratamiento para completar los ejes.');
        const result = await autoCompleteCaseStudyWithAi(treatmentId);
        toast(`${result.changed} ${result.changed === 1 ? 'eje actualizado' : 'ejes actualizados'} con evidencia de anamnesis.`);
        dispatchWorkspaceIndexMode('estudio');
      } catch (err) {
        if (!/cancelado/i.test(err?.message || '')) toast(err?.message || 'No se pudieron completar los ejes.');
      } finally {
        if (caseStudyBtn.isConnected) {
          caseStudyBtn.disabled = false;
          caseStudyBtn.textContent = original;
        }
      }
      return;
    }
    const btn = e.target.closest('[data-reorder-anamnesis]');
    if (!btn || !host.contains(btn) || btn.disabled) return;
    e.preventDefault();
    e.stopPropagation();

    const snapshot = anamnesisFieldSnapshot(form);
    if (!hasAnamnesisReorderInput(snapshot)) {
      toast('Escribe algo en los campos de anamnesis antes de reorganizar.');
      form.querySelector('[name="motivo"]')?.focus();
      return;
    }

    const textEl = btn.querySelector('.btn-ai-reorder__text');
    const orbHost = btn.querySelector('.btn-ai-reorder__orb');
    let stopOrb = () => {};

    try {
      await confirmClinicalAiSend({
        contextText: anamnesisReorderContextText(snapshot),
        purpose: 'Reorganizar campos de anamnesis',
      });

      btn.disabled = true;
      btn.dataset.busy = '1';
      lockReorderFields(true);
      if (textEl) textEl.textContent = 'Reorganizando…';
      if (orbHost) orbHost.hidden = false;
      try {
        const { mountThinkingOrb } = await import('../thinking-orb.js');
        stopOrb = mountThinkingOrb(orbHost, { state: 'working', size: 20 });
      } catch {
        stopOrb = () => {};
      }

      toast('Reorganizando con IA…');
      const next = await reorganizeAnamnesis(snapshot);
      const apply = shouldApplyAnamnesisAi({ form, snapshot, generation });
      if (!apply.ok) {
        if (apply.reason === 'diverged') {
          toast('El texto cambió mientras reorganizabas; no se aplicó para no borrar lo nuevo.');
        } else {
          toast('Ya no estás en anamnesis; no se aplicó la reorganización.');
        }
        return;
      }
      const setVal = (name, value) => {
        const el = form.querySelector(`[name="${name}"]`);
        if (el) el.value = value;
      };
      for (const key of ANAMNESIS_REORDER_KEYS) {
        if (key === 'medicacion' && key in next) {
          medicationTags.splice(0, medicationTags.length,
            ...String(next[key] || '').split(/\n|;/).map((name) => name.trim()).filter(Boolean)
              .map((name) => ({ name, use: PSYCHIATRIC_MEDICATIONS.find((item) => item.name.toLowerCase() === name.toLowerCase())?.use || 'Indicación por registrar' })));
          renderMedicationTags();
        } else if (key in next) setVal(key, next[key]);
      }
      await persist();
      toast('Anamnesis reorganizada');
    } catch (err) {
      const msg = err?.message || 'No se pudo reorganizar el texto.';
      if (!/cancelado/i.test(msg)) toast(msg);
    } finally {
      lockReorderFields(false);
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
