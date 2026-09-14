import { confirmClinicalAiSend } from '../ai-clinical-send.js';
import { chatCompletion } from '../ai-client.js';
import { syncModuleReadableText } from '../readable-text.js';
import { bindAutoSave, queuedPersist } from '../autobind.js';
import { notifySaveError, workspaceAutoSaveStatus } from '../save-status.js';
import { ICON_STAR } from '../icons.js';
import { escapeHtml, parseJsonSafe, toast } from '../utils.js';

export const IA_ANAMNESIS_PROMPTS = [
  { key: 'ia_pregunto', n: '01', q: '¿Qué preguntaste?' },
  { key: 'ia_compartio', n: '02', q: '¿Qué compartiste?' },
  { key: 'ia_respondio', n: '03', q: '¿Qué te respondió?' },
  { key: 'ia_hizo', n: '04', q: '¿Qué hiciste con eso?' },
  { key: 'ia_lugar', n: '05', q: '¿Qué lugar ocupa ahora?' },
];

export const IA_ANAMNESIS_PLACEHOLDER = IA_ANAMNESIS_PROMPTS.map((p) => p.q).join('\n');

/** Placeholder HTML: &#10; para que WebKit respete una pregunta por línea. */
export function iaAnamnesisPlaceholderAttr() {
  return IA_ANAMNESIS_PROMPTS.map((p) => escapeHtml(p.q)).join('&#10;');
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
      </form>
    </div>`;

  const form = host.querySelector('#form-motivo');
  const urgenciaHint = host.querySelector('#motivo-urgencia-hint');
  const urgenciaSelect = form.querySelector('[name="urgencia"]');

  urgenciaSelect?.addEventListener('change', () => {
    const v = urgenciaSelect.value;
    if (urgenciaHint) urgenciaHint.textContent = URGENCIA_HINT[v] || URGENCIA_HINT.media;
  });

  const persistRaw = async () => {
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
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
        if (key in next) setVal(key, next[key]);
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
