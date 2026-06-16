import { NOTE_COLORS } from '../config.js';

/* Grid loader 3×3 — onda diagonal en idle, ripple desde centro al pensar */
const AI_GRID_SVG = `<svg class="ai-grid" viewBox="0 0 22 22" width="16" height="16" fill="none" aria-hidden="true">
  <circle class="d d0" cx="3"  cy="3"  r="1.9"/>
  <circle class="d d1" cx="11" cy="3"  r="1.9"/>
  <circle class="d d2" cx="19" cy="3"  r="1.9"/>
  <circle class="d d3" cx="3"  cy="11" r="1.9"/>
  <circle class="d d4" cx="11" cy="11" r="1.9"/>
  <circle class="d d5" cx="19" cy="11" r="1.9"/>
  <circle class="d d6" cx="3"  cy="19" r="1.9"/>
  <circle class="d d7" cx="11" cy="19" r="1.9"/>
  <circle class="d d8" cx="19" cy="19" r="1.9"/>
</svg>`;
import {
  addClinicalNote,
  deleteClinicalNote,
  getClinicalNotes,
  getSessionsWithModules,
  getSpaceChecks,
  setSpaceCheck,
  updateClinicalNote,
} from '../db.js';
import { debounce } from '../autobind.js';
import { spaceCheckDescription } from '../space-check-descriptions.js';
import { loadProfile } from '../profile.js';
import { escapeHtml, practitionerInitials, toast } from '../utils.js';
import { resolveAiConfig } from '../ai-config.js';
import { chatCompletion } from '../ai-client.js';
import { buildCaseContextText } from '../export-case-context.js';
import { mountWorkspaceToolsTab } from './workspace-tools-menu.js';
import { renderWorkspaceScores } from './workspace-scores.js';
import { ICON_PALETTE } from '../icons.js';

const PERFIL_ONLY_SELECTED_KEY = (treatmentId) => `telar.perfil.onlySelected.${treatmentId}`;

function readPerfilOnlySelected(treatmentId) {
  try {
    return localStorage.getItem(PERFIL_ONLY_SELECTED_KEY(treatmentId)) === '1';
  } catch {
    return false;
  }
}

function writePerfilOnlySelected(treatmentId, on) {
  try {
    localStorage.setItem(PERFIL_ONLY_SELECTED_KEY(treatmentId), on ? '1' : '0');
  } catch {
    /* ignore */
  }
}
const PERFIL_SECTIONS = [
  {
    id: 'fortalezas',
    label: 'Recursos y factores protectores',
    subtitle: 'Capacidades, habilidades y redes de apoyo del paciente',
    icon: `<svg class="perfil-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  },
  {
    id: 'defensas',
    label: 'Mecanismos de defensa',
    subtitle: 'Orientativo; alineado con EED — marca 3–5 predominantes',
    icon: `<svg class="perfil-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>`,
  },
  {
    id: 'riesgos',
    label: 'Vulnerabilidades y riesgo clínico actual',
    subtitle: 'Factores de riesgo y fragilidades identificadas en el caso',
    icon: `<svg class="perfil-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  },
];

/*
 * Cross-referencias conceptuales entre secciones del Perfil.
 * Un mecanismo en Defensas puede tener expresión conductual en Vulnerabilidades
 * y viceversa — se muestra como hint en el ítem para guiar al clínico.
 */
const PERFIL_CROSS_REFS = {
  defensas: {
    'Acting out':
      '→ Si hay conducta disruptiva real, ver «Violencia / impulsividad» en Vulnerabilidades',
    'Pasivo-agresividad':
      '→ Si hay hostilidad activa, considerar «Violencia / impulsividad» en Vulnerabilidades',
    'Disociación leve':
      '→ Si se intensifica o hay amnesia, ver «Factores psicosociales de vulnerabilidad»',
    'Disociación profunda':
      '→ Evaluar «Aislamiento social» y «Factores psicosociales de vulnerabilidad» en Vulnerabilidades',
    Negación:
      '→ Puede obstaculizar adherencia; evaluar nivel de riesgo en Vulnerabilidades',
    'Identificación proyectiva':
      '→ Evaluar impacto en vínculos; ver «Factores psicosociales de vulnerabilidad»',
  },
  riesgos: {
    'Violencia / impulsividad':
      '→ Ver «Acting out» y «Pasivo-agresividad» en Mecanismos de defensa',
    'Aislamiento social':
      '→ Ver «Disociación leve/profunda» en Mecanismos de defensa si hay desconexión',
    'Factores psicosociales de vulnerabilidad':
      '→ Revisar defensas desadaptativas en Mecanismos de defensa',
  },
};

export async function mountNotesPanel(container, treatmentId, toolsOpts = {}) {
  let refreshList = async () => {};
  let activeTab = 'notas';
  const profile = loadProfile();
  const defaultInitials = practitionerInitials(profile.name);

  container.innerHTML = `
    <div class="space-tools" data-active-tab="notas">
      <nav class="space-tools__tabs2" role="tablist">
        ${[
          ['notas', 'Notas'],
          ['puntajes', 'Puntajes'],
          ['perfil', 'Perfil'],
          ['herramientas', 'Herramientas'],
        ]
          .map(
            ([id, label]) =>
              `<button type="button" class="space-tab2${id === 'notas' ? ' active' : ''}" data-tab="${id}" title="${escapeHtml(label)}"><span>${escapeHtml(label)}</span></button>`,
          )
          .join('')}
      </nav>
      <div class="space-tools__content">
        <div class="notes-scroll" id="notes-list"></div>
      </div>
      <div class="space-tools__fab">
        <button type="button" class="btn btn-secondary btn-fab" id="btn-add-note" title="Añadir nota clínica">+ Nota</button>
      </div>
      <aside class="ai-dock" aria-label="Asistente IA">
        <div class="ai-dock__input-row">
          <textarea class="input ai-dock__input" id="ai-dock-input" placeholder="Pregunta a la IA sobre el caso" rows="1"></textarea>
          <button type="button" class="btn btn-primary" id="ai-dock-send"><span class="ai-dock-label">Consultar</span>${AI_GRID_SVG}</button>
        </div>
        <p class="ai-dock__hint" id="ai-dock-hint" hidden></p>
      </aside>
    </div>`;

  const listEl = container.querySelector('#notes-list');

  const scrollNotesToBottom = () => {
    requestAnimationFrame(() => {
      listEl.scrollTop = listEl.scrollHeight;
    });
  };

  refreshList = async ({ scrollBottom = false } = {}) => {
    if (activeTab === 'notas') {
      const all = await getClinicalNotes(treatmentId);
      const sorted = [...all].sort((a, b) =>
        String(a.created_at || '').localeCompare(String(b.created_at || '')),
      );
      if (!sorted.length) {
        listEl.innerHTML = `<p class="notes-empty">Pulsa + Nota para añadir un comentario. También puedes seleccionar texto en un módulo para crear una anotación.</p>`;
        return;
      }
      listEl.innerHTML = sorted.map((n) => kindleNoteHtml(n, defaultInitials)).join('');
      bindNoteCards(listEl, refreshList);
      if (scrollBottom) scrollNotesToBottom();
      return;
    }

    if (activeTab === 'puntajes') {
      const sessions = await getSessionsWithModules(treatmentId);
      const moduleTypes = [
        ...new Set(sessions.flatMap((s) => s.modules.map((m) => m.module_type))),
      ];
      await renderWorkspaceScores(listEl, treatmentId, moduleTypes, { expandAll: true });
      return;
    }

    if (activeTab === 'perfil') {
      await renderPerfilTab(listEl, treatmentId, profile, refreshList);
      return;
    }

    if (activeTab === 'herramientas') {
      mountWorkspaceToolsTab(listEl, { treatmentId, ...toolsOpts });
    }
  };

  container.querySelectorAll('.space-tab2').forEach((btn) => {
    btn.addEventListener('click', async () => {
      activeTab = btn.dataset.tab;
      const tools = container.querySelector('.space-tools');
      if (tools) tools.dataset.activeTab = activeTab;
      container.querySelectorAll('.space-tab2').forEach((b) => b.classList.toggle('active', b === btn));
      const fab = container.querySelector('#btn-add-note');
      if (fab) fab.hidden = activeTab !== 'notas';
      await refreshList();
    });
  });

  container.querySelector('#btn-add-note')?.addEventListener('click', async () => {
    const id = await addClinicalNote(treatmentId, {
      kind: 'comment',
      color: 'yellow',
      authorInitials: defaultInitials,
    });
    await refreshList({ scrollBottom: true });
    listEl.querySelector(`[data-note-id="${id}"]`)?.focus();
  });

  await refreshList();

  const aiInput = container.querySelector('#ai-dock-input');
  const aiSend = container.querySelector('#ai-dock-send');
  const aiHint = container.querySelector('#ai-dock-hint');
  const aiCfg = resolveAiConfig(profile);

  if (!aiCfg.enabled) {
    aiInput.disabled = true;
    aiSend.disabled = true;
    aiHint.textContent = 'Activa el asistente IA en Ajustes → Proveedor de IA.';
    aiHint.hidden = false;
  } else {
    // Auto-grow textarea hacia arriba (la notas list encoge con 1fr)
    const autoGrow = () => {
      aiInput.style.height = 'auto';
      aiInput.style.height = Math.min(aiInput.scrollHeight, 120) + 'px';
    };
    aiInput.addEventListener('input', autoGrow);

    // Disabled cuando vacío (solo evalúa si no estamos en estado "pensando")
    const syncSendState = () => {
      if (!aiSend.querySelector('.ai-grid--thinking')) {
        aiSend.disabled = aiInput.value.trim() === '';
      }
    };
    aiInput.addEventListener('input', syncSendState);
    syncSendState();

    const resetInput = () => {
      aiInput.value = '';
      aiInput.style.height = '';
      syncSendState();
    };

    const sendAiQuestion = async () => {
      const q = aiInput.value.trim();
      if (!q) return;
      aiInput.disabled = true;
      aiSend.disabled = true;
      const gridEl = aiSend.querySelector('.ai-grid');
      aiSend.querySelector('.ai-dock-label').textContent = 'Consultando';
      if (gridEl) gridEl.classList.add('ai-grid--thinking');
      // Yield al navegador para que pinte la animación antes del trabajo pesado
      await new Promise(r => requestAnimationFrame(r));
      try {
        const context = await buildCaseContextText(treatmentId);
        const { text } = await chatCompletion({
          messages: [
            {
              role: 'system',
              content:
                'Eres un asistente clínico de apoyo al psicoterapeuta. Responde de forma concisa y fundamentada. Evita listas con asteriscos; usa texto corrido o numeración. Contexto del caso:\n\n' +
                context,
            },
            { role: 'user', content: q },
          ],
          maxTokens: 800,
        });
        await addClinicalNote(treatmentId, {
          kind: 'ia_answer',
          color: 'teal',
          content: text,
          authorInitials: 'IA',
          sourceLabel: q,
        });
        resetInput();
        await refreshList({ scrollBottom: true });
      } catch (err) {
        await addClinicalNote(treatmentId, {
          kind: 'ia_answer',
          color: 'yellow',
          content: err.message || 'Error al consultar la IA.',
          authorInitials: 'IA',
          sourceLabel: q,
        });
        await refreshList({ scrollBottom: true });
      } finally {
        aiInput.disabled = false;
        aiSend.querySelector('.ai-dock-label').textContent = 'Consultar';
        const gridFinal = aiSend.querySelector('.ai-grid');
        if (gridFinal) gridFinal.classList.remove('ai-grid--thinking');
        syncSendState();
      }
    };

    aiSend.addEventListener('click', sendAiQuestion);
    aiInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAiQuestion();
      }
    });
  }

  const focusNotasTab = async () => {
    activeTab = 'notas';
    const tools = container.querySelector('.space-tools');
    if (tools) tools.dataset.activeTab = 'notas';
    container.querySelectorAll('.space-tab2').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === 'notas');
    });
    const fab = container.querySelector('#btn-add-note');
    if (fab) fab.hidden = false;
    await refreshList({ scrollBottom: true });
  };

  return {
    refresh: refreshList,
    focusNotasTab,
    setTab() {
      return refreshList();
    },
  };
}

async function renderPerfilTab(listEl, treatmentId, profile, rerender) {
  const aiCfg = resolveAiConfig(profile);
  const onlySelected = readPerfilOnlySelected(treatmentId);
  listEl.innerHTML = `
    <div class="perfil-panel">
      <button type="button" class="btn btn-secondary btn-sm btn-block" id="btn-analyze-perfil" ${aiCfg.enabled ? '' : 'disabled'}>
        Analizar perfil con IA
      </button>
      ${aiCfg.enabled ? '' : '<p class="perfil-panel__hint">Activa el asistente IA en Ajustes para usar esta función.</p>'}
      <div class="perfil-panel__toolbar">
        <input type="search" class="input input-sm" id="perfil-search" placeholder="Buscar en perfil…" autocomplete="off" />
        <label class="perfil-panel__toggle">
          <input type="checkbox" id="perfil-only-selected" ${onlySelected ? 'checked' : ''} />
          <span>Solo seleccionados</span>
        </label>
      </div>
      <div id="perfil-sections"></div>
    </div>`;

  const sectionsHost = listEl.querySelector('#perfil-sections');
  const searchEl = listEl.querySelector('#perfil-search');
  const onlyEl = listEl.querySelector('#perfil-only-selected');

  const renderSections = async () => {
    await renderPerfilSections(sectionsHost, treatmentId, {
      query: searchEl?.value?.trim().toLowerCase() || '',
      onlySelected: Boolean(onlyEl?.checked),
    });
  };

  searchEl?.addEventListener('input', () => {
    renderSections();
  });
  onlyEl?.addEventListener('change', () => {
    writePerfilOnlySelected(treatmentId, onlyEl.checked);
    renderSections();
  });

  await renderSections();

  listEl.querySelector('#btn-analyze-perfil')?.addEventListener('click', async () => {
    const btn = listEl.querySelector('#btn-analyze-perfil');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = 'Analizando…';
    try {
      await analyzeProfileWithAi(treatmentId);
      writePerfilOnlySelected(treatmentId, true);
      if (onlyEl) onlyEl.checked = true;
      await renderSections();
      toast('Perfil actualizado según el análisis de IA');
    } catch (err) {
      toast(err.message || 'No se pudo analizar el perfil');
    } finally {
      btn.disabled = false;
      btn.textContent = prev;
    }
  });
}

async function renderPerfilSections(host, treatmentId, { query = '', onlySelected = false } = {}) {
  const html = await Promise.all(
    PERFIL_SECTIONS.map(async (sec) => {
      let labels = sortLabels(defaultsFor(sec.id));
      const existing = await getSpaceChecks(treatmentId, sec.id);
      const map = new Map(existing.map((r) => [r.label, Number(r.checked) === 1]));
      if (onlySelected) {
        labels = labels.filter((l) => map.get(l));
      }
      if (query) {
        labels = labels.filter((l) => l.toLowerCase().includes(query));
      }
      if (!labels.length) return '';
      const checkedCount = labels.filter((l) => map.get(l)).length;
      const items = labels
        .map((label) => {
          const checked = map.get(label) || false;
          const desc = spaceCheckDescription(sec.id, label);
          const xref = PERFIL_CROSS_REFS[sec.id]?.[label] || '';
          return `
          <label class="space-check">
            <input type="checkbox" data-space-check data-category="${sec.id}" value="${escapeHtml(label)}" ${checked ? 'checked' : ''}/>
            <span class="space-check__body">
              <span class="space-check__title">${escapeHtml(label)}</span>
              ${desc ? `<span class="space-check__desc">${escapeHtml(desc)}</span>` : ''}
              ${xref ? `<span class="space-check__xref">${escapeHtml(xref)}</span>` : ''}
            </span>
          </label>`;
        })
        .join('');

      return `
        <details class="perfil-section" open>
          <summary class="perfil-section__head">
            <span class="perfil-section__head-left">
              ${sec.icon}
              <span class="perfil-section__title-group">
                <span class="perfil-section__title">${escapeHtml(sec.label)}</span>
                ${sec.subtitle ? `<span class="perfil-section__subtitle">${escapeHtml(sec.subtitle)}</span>` : ''}
              </span>
            </span>
            <span class="perfil-section__count">${checkedCount}/${labels.length}</span>
          </summary>
          <div class="space-checklist">${items}</div>
        </details>`;
    }),
  );
  host.innerHTML =
    html.filter(Boolean).join('') ||
    '<p class="perfil-panel__hint">Sin ítems que coincidan con el filtro.</p>';

  host.querySelectorAll('[data-space-check]').forEach((cb) => {
    cb.addEventListener('change', async () => {
      await setSpaceCheck(treatmentId, cb.dataset.category, cb.value, cb.checked);
      const section = cb.closest('.perfil-section');
      const boxes = section?.querySelectorAll('[data-space-check]');
      const count = section?.querySelector('.perfil-section__count');
      if (boxes && count) {
        const n = [...boxes].filter((x) => x.checked).length;
        count.textContent = `${n}/${boxes.length}`;
      }
    });
  });
}

async function analyzeProfileWithAi(treatmentId) {
  const context = await buildCaseContextText(treatmentId);
  const lists = Object.fromEntries(
    PERFIL_SECTIONS.map((s) => [s.id === 'riesgos' ? 'debilidades' : s.id, sortLabels(defaultsFor(s.id))]),
  );

  const { text } = await chatCompletion({
    messages: [
      {
        role: 'system',
        content: `Eres psicólogo clínico experto en psicoterapia. Analiza el caso y selecciona los ítems que aplican según estas reglas ESTRICTAS:

REGLAS (NO las violes):
1. NO marques el mismo concepto en «recursos» y en «defensas». Humor, Sublimación, Altruismo, Anticipación, Supresión son mecanismos de defensa adaptativos → van SOLO en defensas, NUNCA en recursos.
2. «Recursos y factores protectores» = solo capacidades, habilidades y redes de apoyo genuinas del paciente, NO mecanismos defensivos.
3. «Acting out» → solo en defensas. Si además hay conducta disruptiva real → marca TAMBIÉN «Violencia / impulsividad» en debilidades.
4. «Disociación profunda» → defensas. Si hay desorganización grave o amnesia → considera también «Factores psicosociales de vulnerabilidad» en debilidades.
5. Incluye solo ítems con evidencia EXPLÍCITA en el contexto. Prefiere pocos ítems certeros a muchos especulativos.
6. Responde SOLO JSON válido sin markdown ni explicaciones:
{"fortalezas":["..."],"defensas":["..."],"debilidades":["..."]}
Usa exactamente los nombres de las listas proporcionadas.`,
      },
      {
        role: 'user',
        content: `Contexto del caso:\n${context}\n\nRecursos posibles:\n${lists.fortalezas.join('\n')}\n\nDefensas posibles:\n${lists.defensas.join('\n')}\n\nDebilidades posibles:\n${lists.debilidades.join('\n')}`,
      },
    ],
    maxTokens: 1200,
  });

  const parsed = parseProfileAiJson(text);
  const apply = async (category, labels) => {
    const allowed = new Set(defaultsFor(category));
    for (const label of labels || []) {
      if (allowed.has(label)) {
        await setSpaceCheck(treatmentId, category, label, true);
      }
    }
  };

  await apply('fortalezas', parsed.fortalezas);
  await apply('defensas', parsed.defensas);
  await apply('riesgos', parsed.debilidades || parsed.riesgos);
}

function parseProfileAiJson(text) {
  const raw = String(text || '').trim();
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('La IA no devolvió un formato válido');
  }
}

function sortLabels(labels) {
  return [...labels].sort((a, b) => a.localeCompare(b, 'es'));
}

function defaultsFor(tab) {
  if (tab === 'fortalezas') {
    // Solo recursos genuinos — los mecanismos de defensa adaptativos
    // (Altruismo, Anticipación, Humor, Sublimación, Supresión, Asertividad emocional)
    // están en "defensas" únicamente para evitar duplicaciones.
    return [
      'Adaptabilidad',
      'Autocuidado',
      'Capacidad de estar solo sin aislarse',
      'Capacidad de reparación',
      'Capacidad de disfrute',
      'Capacidad de pedir ayuda',
      'Creatividad',
      'Empatía',
      'Estructura diaria / disciplina',
      'Flexibilidad cognitiva',
      'Insight',
      'Participación en comunidad',
      'Propósito o sentido espiritual',
      'Red de apoyo emocional',
      'Regulación afectiva',
      'Tolerancia a la frustración',
      'Vínculos seguros',
      'Actividad física',
    ];
  }
  if (tab === 'defensas') {
    return [
      'Anticipación',
      'Sublimación',
      'Altruismo',
      'Humor',
      'Supresión',
      'Asertividad emocional',
      'Auto-observación',
      'Función reactiva funcional',
      'Actividad imaginativa',
      'Pseudo-altruismo',
      'Formación reactiva',
      'Desplazamiento',
      'Aislamiento del afecto',
      'Racionalización',
      'Intelectualización',
      'Negación parcial',
      'Represión parcial',
      'Disociación leve',
      'Somatización',
      'Proyección',
      'Identificación proyectiva',
      'Splitting (escisión)',
      'Pasivo-agresividad',
      'Idealización',
      'Acting out',
      'Negación',
      'Fantasía evasiva',
      'Disociación profunda',
      'Regresión',
    ];
  }
  if (tab === 'riesgos') {
    // 'Defensas desadaptativas predominantes' se quitó — el detalle queda
    // en la sección Mecanismos de defensa con las defensas específicas marcadas.
    return [
      'Ideación suicida',
      'Plan suicida',
      'Intentos previos',
      'Acceso a medios de autosión',
      'Desesperanza o inutilidad expresada',
      'Consumo de sustancias',
      'Aislamiento social',
      'Autolesiones',
      'Violencia / impulsividad',
      'Agitación o ansiedad elevada',
      'Factores psicosociales de vulnerabilidad',
    ];
  }
  return [];
}

function renderMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^#{1,3} (.+)$/gm, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function kindleNoteHtml(note, fallbackInitials) {
  const color = note.color || note.note_type || 'teal';
  const starred = Boolean(note.starred);
  const initials = note.author_initials || fallbackInitials || '—';
  const kind = note.kind || 'comment';
  const quote = note.quote_text || '';
  const source = note.source_label || '';
  const showQuote = kind === 'annotation' && quote;
  const isAi = kind === 'ia_answer';

  const paletteDots = NOTE_COLORS.map(
    (c) =>
      `<button type="button" class="kindle-note__palette-dot${c.id === color ? ' active' : ''}" data-color="${c.id}" title="${escapeHtml(c.label)}" style="background:var(--note-${c.id})"></button>`,
  ).join('');

  const bodyContent = isAi
    ? `
        ${source ? `<p class="kindle-note__source kindle-note__source--question">${escapeHtml(source)}</p>` : ''}
        <div class="kindle-note__ai-answer">${renderMarkdown(note.content || '')}</div>`
    : `
        ${source ? `<p class="kindle-note__source">${escapeHtml(source)}</p>` : ''}
        ${showQuote ? `<blockquote class="kindle-note__quote"><span class="kindle-note__quote-mark">"</span>${escapeHtml(quote)}</blockquote>` : ''}
        ${showQuote ? '<hr class="kindle-note__rule" />' : ''}
        <textarea class="kindle-note__comment" data-note-id="${note.id}" placeholder="${showQuote ? 'Tu comentario sobre la cita…' : 'Escribe un comentario…'}">${escapeHtml(note.content || '')}</textarea>`;

  return `
    <article class="kindle-note kindle-note--${escapeHtml(color)}${starred ? ' kindle-note--starred' : ''}${isAi ? ' kindle-note--ia' : ''}" data-id="${note.id}" data-color="${escapeHtml(color)}" data-kind="${kind}" data-content-encoded="${encodeURIComponent(note.content || '')}">
      <div class="kindle-note__body">
        ${bodyContent}
      </div>
      <div class="kindle-note__rail">
        <span class="kindle-note__rail-btn kindle-note__author" title="${isAi ? 'Respuesta IA' : 'Autor/a de la nota'}">${escapeHtml(initials)}</span>
        <button type="button" class="kindle-note__rail-btn note-star${starred ? ' active' : ''}" title="Destacar nota" aria-pressed="${starred}">★</button>
        <button type="button" class="kindle-note__rail-btn note-palette" title="Cambiar color de la nota" aria-haspopup="true">${ICON_PALETTE}</button>
        <div class="kindle-note__palette-pop" hidden role="radiogroup" aria-label="Color de la nota">${paletteDots}</div>
        <button type="button" class="kindle-note__rail-btn note-delete" title="Eliminar nota">×</button>
      </div>
    </article>`;
}

function bindNoteCards(listEl, rerender) {
  ensurePaletteClose();
  listEl.querySelectorAll('.kindle-note').forEach((card) => {
    const id = Number(card.dataset.id);
    const ta = card.querySelector('.kindle-note__comment');

    const readFields = () => {
      const isAiNote = card.dataset.kind === 'ia_answer';
      let content = ta?.value ?? '';
      if (isAiNote) {
        try {
          content = decodeURIComponent(card.dataset.contentEncoded || '');
        } catch {
          content = card.querySelector('.kindle-note__ai-answer')?.textContent ?? '';
        }
      }
      return {
        content,
        color: card.dataset.color || 'teal',
        starred: card.classList.contains('kindle-note--starred'),
        quoteText: card.querySelector('.kindle-note__quote')?.textContent?.replace(/^"/, '')?.trim() ?? '',
        sourceLabel: card.querySelector('.kindle-note__source')?.textContent?.trim() ?? '',
      };
    };

    const save = debounce(async () => {
      const f = readFields();
      await updateClinicalNote(id, f);
    }, 400);

    ta?.addEventListener('input', save);

    card.querySelector('.note-star')?.addEventListener('click', async () => {
      const next = !card.classList.contains('kindle-note--starred');
      card.classList.toggle('kindle-note--starred', next);
      card.querySelector('.note-star')?.classList.toggle('active', next);
      const f = readFields();
      f.starred = next;
      await updateClinicalNote(id, f);
    });

    card.querySelector('.note-delete')?.addEventListener('click', async () => {
      await deleteClinicalNote(id);
      await rerender();
    });

    const pop = card.querySelector('.kindle-note__palette-pop');
    card.querySelector('.note-palette')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const hidden = pop.hasAttribute('hidden');
      document.querySelectorAll('.kindle-note__palette-pop').forEach((p) => p.setAttribute('hidden', ''));
      if (hidden) pop.removeAttribute('hidden');
      else pop.setAttribute('hidden', '');
    });

    pop?.addEventListener('click', (e) => e.stopPropagation());

    pop?.querySelectorAll('.kindle-note__palette-dot').forEach((dot) => {
      dot.addEventListener('click', () => {
        const c = dot.dataset.color;
        card.className = `kindle-note kindle-note--${c}${card.classList.contains('kindle-note--starred') ? ' kindle-note--starred' : ''}${card.dataset.kind === 'ia_answer' ? ' kindle-note--ia' : ''}`;
        card.dataset.color = c;
        pop.setAttribute('hidden', '');
        save();
      });
    });
  });
}

let paletteCloseBound = false;
function ensurePaletteClose() {
  if (paletteCloseBound) return;
  paletteCloseBound = true;
  document.addEventListener('click', (e) => {
    if (e.target.closest('.note-palette') || e.target.closest('.kindle-note__palette-pop')) return;
    document.querySelectorAll('.kindle-note__palette-pop').forEach((p) => p.setAttribute('hidden', ''));
  });
}
