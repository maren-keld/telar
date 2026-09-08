import { chatCompletion, createAiRequest } from './ai-client.js';
import { breakdownModel, STAT_COLORS } from './reportes-charts.js';
import { escapeHtml } from './utils.js';

const PINNED_KEY = 'telar-stats-pinned';
const LEGACY_CATEGORY_KEY = 'telar-stats-categories';
const UNSUITABLE_LANGUAGE = /\b(we[oó]n|wea|weón|culiao|culiáo|mierda|puta|chucha|carajo)\b/gi;

const SUGGESTIONS = [
  '¿Los tratamientos completados cambian según género?',
  '¿La duración del tratamiento se asocia con su estado de cierre?',
  '¿Qué fuente de derivación concentra más tratamientos activos?',
  '¿Qué rangos de edad muestran mayor dispersión en tratamientos activos?',
];

function cleanAssistantText(value) {
  return String(value || '')
    .replace(UNSUITABLE_LANGUAGE, '—')
    .replace(/\*{1,3}/g, '')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function compactStatsContext({ dash, groups, demo } = {}) {
  const count = (status) => (groups?.[status] || []).length;
  return {
    pacientes: Number(dash?.total_patients || 0),
    tratamientos: Number(dash?.total_treatments || 0),
    estados: {
      en_tratamiento: count('en_tratamiento'),
      completado: count('completado'),
      en_pausa: count('en_pausa'),
      abandonado: count('abandonado'),
    },
    pacientes_nuevos_por_mes: (dash?.new_patients_by_month || []).map((row) => ({
      mes: row.ym,
      n: Number(row.count || 0),
    })),
    edad: demo?.age_ranges || [],
    genero: demo?.gender || [],
    estado_marital: demo?.marital_status || [],
    prevision: demo?.prevision || [],
    fuente_derivacion: demo?.source || [],
  };
}

export function normalizeChart(chart) {
  if (!chart || typeof chart !== 'object') return null;
  const type = ['bar', 'pie', 'stat'].includes(chart.type) ? chart.type : 'bar';
  const labels = Array.isArray(chart.labels) ? chart.labels.map((label) => String(label).slice(0, 48)) : [];
  const values = Array.isArray(chart.values) ? chart.values.map((value) => Number(value) || 0) : [];
  if (type === 'stat') {
    const value = Number(chart.value ?? values[0]);
    if (!Number.isFinite(value)) return null;
    return { type: 'stat', label: String(chart.label || labels[0] || ''), value };
  }
  const n = Math.min(labels.length, values.length, 12);
  if (n < 1) return null;
  return { type, labels: labels.slice(0, n), values: values.slice(0, n) };
}

export function parseStatsInsight(text) {
  const raw = String(text || '').trim();
  let parsed = null;
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || raw.match(/\{[\s\S]*\}/)?.[0];
  if (candidate) {
    try {
      parsed = JSON.parse(candidate);
    } catch {
      parsed = null;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      title: 'Vista sugerida',
      insight: cleanAssistantText(raw).slice(0, 280),
      chart: null,
    };
  }
  return {
    title: cleanAssistantText(parsed.title || 'Vista sugerida').slice(0, 88) || 'Vista sugerida',
    insight: cleanAssistantText(parsed.insight || parsed.text || '').slice(0, 280),
    chart: normalizeChart(parsed.chart),
  };
}

function slicesToChart(slices, type = 'pie') {
  if (!Array.isArray(slices) || slices.length < 1) return null;
  return normalizeChart({
    type: slices.length === 1 ? 'stat' : type,
    labels: slices.map((slice) => slice.label),
    values: slices.map((slice) => slice.count),
    value: slices[0]?.count,
    label: slices[0]?.label,
  });
}

export function fallbackChart(prompt, ctx = {}) {
  const text = String(prompt || '').toLowerCase();
  if (/g[eé]nero|sexo/.test(text)) return slicesToChart(ctx.genero);
  if (/edad|rango/.test(text)) return slicesToChart(ctx.edad, 'bar');
  if (/derivaci[oó]n|fuente/.test(text)) return slicesToChart(ctx.fuente_derivacion, 'bar');
  if (/previsi[oó]n|cobertura|afiliaci[oó]n|seguro de salud|r[eé]gimen de salud/.test(text)) return slicesToChart(ctx.prevision);
  if (/marital|civil/.test(text)) return slicesToChart(ctx.estado_marital);
  if (/nuevo/.test(text) && /paciente/.test(text)) {
    const rows = ctx.pacientes_nuevos_por_mes || [];
    return normalizeChart({
      type: 'bar',
      labels: rows.map((row) => String(row.mes || '').slice(5) || row.mes),
      values: rows.map((row) => row.n),
    });
  }
  if (/tratamiento|cierre|pausa|aband|complet/.test(text)) {
    const estados = ctx.estados || {};
    return normalizeChart({
      type: 'bar',
      labels: ['En tratamiento', 'Completados', 'En pausa', 'Abandonados'],
      values: [
        Number(estados.en_tratamiento || 0),
        Number(estados.completado || 0),
        Number(estados.en_pausa || 0),
        Number(estados.abandonado || 0),
      ],
    });
  }
  return null;
}

export function withChartFallback(insight, prompt, ctx) {
  if (insight?.chart) return insight;
  const chart = fallbackChart(prompt, ctx);
  return chart ? { ...insight, chart } : insight;
}

export function loadPinnedCards() {
  try {
    const value = JSON.parse(localStorage.getItem(PINNED_KEY) || '[]');
    return Array.isArray(value)
      ? value.filter((card) => card?.id && card?.title).map((card) => ({
          ...card,
          chart: normalizeChart(card.chart),
        }))
      : [];
  } catch {
    return [];
  }
}

export function savePinnedCards(cards) {
  try {
    localStorage.setItem(PINNED_KEY, JSON.stringify(cards));
    localStorage.removeItem(LEGACY_CATEGORY_KEY);
  } catch {
    /* el tablero sigue en memoria si storage no está disponible */
  }
}

function chartVisualHtml(chart) {
  if (!chart) return '';
  if (chart.type === 'stat') {
    return `<p class="stats-generated-card__stat">${escapeHtml(String(chart.value))}</p>${
      chart.label ? `<p>${escapeHtml(chart.label)}</p>` : ''
    }`;
  }
  if (chart.type === 'pie') {
    const model = breakdownModel(
      chart.labels.map((label, index) => ({ label, count: chart.values[index] })),
      STAT_COLORS,
    );
    return `<div class="stat-seg" aria-hidden="true">${model.rows
      .map(
        (row) =>
          `<span class="stat-seg__pill" style="flex:${Math.max(row.count, 0.2)};background:${row.color}"></span>`,
      )
      .join('')}</div>
      <ul class="stat-legend">${model.rows
        .map(
          (row) => `<li>
            <span class="stat-legend__swatch" style="background:${row.color}"></span>
            <span class="stat-legend__label">${escapeHtml(row.label)}</span>
            <strong class="stat-legend__n">${row.count}</strong>
          </li>`,
        )
        .join('')}</ul>`;
  }
  const max = Math.max(1, ...chart.values);
  return `<div class="stats-generated-card__bars" role="img">${chart.values
    .map((value, index) => {
      const height = Math.max(8, (value / max) * 100);
      return `<i style="height:${height}%" title="${escapeHtml(chart.labels[index])}: ${value}"></i>`;
    })
    .join('')}</div>
    <div class="stats-generated-card__axis">${chart.labels
      .map((label) => `<span>${escapeHtml(label)}</span>`)
      .join('')}</div>`;
}

function cardHtml(card, { preview = false } = {}) {
  const actions = preview
    ? `<button type="button" class="btn btn-primary btn-sm" data-stats-pin>Fijar en Personalizada</button>`
    : `<button type="button" class="btn btn-ghost btn-sm" data-stats-unpin aria-label="Quitar del tablero">Quitar</button>`;
  return `<article class="card stats-generated-card" draggable="true" data-stats-card="${escapeHtml(card.id)}">
    <div class="stats-generated-card__head">
      <span class="badge badge--subtle">${preview ? 'Vista previa' : 'Personalizada'}</span>
      <span class="stats-generated-card__drag" aria-hidden="true">⠿</span>
    </div>
    <h3>${escapeHtml(card.title)}</h3>
    ${card.insight ? `<p>${escapeHtml(card.insight)}</p>` : ''}
    ${chartVisualHtml(card.chart)}
    <div class="stats-generated-card__actions">${actions}</div>
  </article>`;
}

function assistantHtml() {
  return `<aside class="stats-assistant card" aria-label="Asistente de estadísticas">
    <div class="stats-assistant__head">
      <div><p class="stats-board__eyebrow">Asistente</p><h2>Explora tus datos</h2></div>
      <span class="badge badge--info">IA</span>
    </div>
    <p class="stats-assistant__intro">Elige una pregunta o escribe la tuya. Si se puede cuantificar, la IA arma un gráfico y una tarjeta para arrastrar a Personalizada.</p>
    <div class="stats-assistant__prompts">${SUGGESTIONS.map(
      (prompt) =>
        `<button type="button" class="btn btn-ghost btn-sm" data-stats-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`,
    ).join('')}</div>
    <div class="stats-assistant__log" data-stats-chat-log aria-live="polite">
      <p class="stats-assistant__hint">Las recomendaciones trabajan con tendencias agregadas; no muestran fichas ni nombres.</p>
    </div>
    <div class="stats-assistant__preview" data-stats-preview></div>
    <form class="stats-assistant__form" data-stats-chat-form>
      <input class="input" data-stats-chat-input placeholder="Pregunta por una relación entre variables…" autocomplete="off"/>
      <button class="btn btn-primary" type="submit">Enviar</button>
    </form>
  </aside>`;
}

function personalizadaHtml() {
  return `<section class="reportes-section stats-personalizada" data-stats-personalizada>
    <h2 class="reportes-section__title">Personalizada</h2>
    <p class="reportes-empty" data-stats-empty>Arrastra acá una vista del asistente para fijarla en el tablero.</p>
    <div class="stats-personalizada__grid" data-stats-pinned></div>
  </section>`;
}

export function enhanceReportesBoard(container, snapshot = {}) {
  const content = container.querySelector('.app-content.reportes-page');
  if (!content || content.dataset.statsEnhanced) return;
  content.dataset.statsEnhanced = 'true';

  const ctx = compactStatsContext(snapshot);
  const layout = document.createElement('div');
  layout.className = 'stats-page-layout';
  const body = document.createElement('div');
  body.className = 'reportes-page__body';
  [...content.children].forEach((node) => body.appendChild(node));
  body.insertAdjacentHTML('beforeend', personalizadaHtml());

  const assistantWrap = document.createElement('div');
  assistantWrap.innerHTML = assistantHtml();
  content.append(layout);
  layout.append(body, assistantWrap.firstElementChild);

  const personalizada = body.querySelector('[data-stats-personalizada]');
  const pinnedGrid = body.querySelector('[data-stats-pinned]');
  const emptyHint = body.querySelector('[data-stats-empty]');
  const previewSlot = content.querySelector('[data-stats-preview]');
  const log = content.querySelector('[data-stats-chat-log]');
  const input = content.querySelector('[data-stats-chat-input]');
  const form = content.querySelector('[data-stats-chat-form]');
  const sendBtn = form?.querySelector('button[type="submit"]');

  let pinned = loadPinnedCards();
  let draft = null;

  const syncEmpty = () => {
    if (emptyHint) emptyHint.hidden = pinned.length > 0;
  };

  const bindCard = (root, card, { preview = false } = {}) => {
    const el = root.querySelector(`[data-stats-card="${CSS.escape(card.id)}"]`);
    if (!el) return;
    el.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData('text/plain', JSON.stringify({ id: card.id, from: preview ? 'preview' : 'board' }));
      event.dataTransfer?.setData('text/telar-stats', card.id);
      el.classList.add('is-dragging');
    });
    el.addEventListener('dragend', () => el.classList.remove('is-dragging'));
    el.querySelector('[data-stats-pin]')?.addEventListener('click', () => pinCard(card));
    el.querySelector('[data-stats-unpin]')?.addEventListener('click', () => unpinCard(card.id));
  };

  const renderPinned = () => {
    pinnedGrid.innerHTML = pinned.map((card) => cardHtml(card)).join('');
    pinned.forEach((card) => bindCard(pinnedGrid, card));
    syncEmpty();
  };

  const renderPreview = () => {
    if (!draft) {
      previewSlot.innerHTML = '';
      return;
    }
    previewSlot.innerHTML = cardHtml(draft, { preview: true });
    bindCard(previewSlot, draft, { preview: true });
  };

  const pinCard = (card) => {
    if (!card?.id) return;
    pinned = [{ ...card }, ...pinned.filter((item) => item.id !== card.id)];
    savePinnedCards(pinned);
    if (draft?.id === card.id) draft = null;
    renderPreview();
    renderPinned();
  };

  const unpinCard = (id) => {
    pinned = pinned.filter((card) => card.id !== id);
    savePinnedCards(pinned);
    renderPinned();
  };

  const dropPayload = (event) => {
    const raw = event.dataTransfer?.getData('text/plain') || '';
    try {
      return JSON.parse(raw);
    } catch {
      return { id: raw, from: 'board' };
    }
  };

  const installDrop = (target) => {
    target.addEventListener('dragover', (event) => {
      event.preventDefault();
      target.classList.add('is-drop-target');
    });
    target.addEventListener('dragleave', (event) => {
      if (!target.contains(event.relatedTarget)) target.classList.remove('is-drop-target');
    });
    target.addEventListener('drop', (event) => {
      event.preventDefault();
      if (target === personalizada) event.stopPropagation();
      target.classList.remove('is-drop-target');
      const payload = dropPayload(event);
      if (payload.from === 'preview' && draft && (payload.id === draft.id || !payload.id)) {
        pinCard(draft);
        return;
      }
      if (target !== personalizada) {
        if (draft) pinCard(draft);
        return;
      }
      const id = payload.id;
      const fromIndex = pinned.findIndex((card) => card.id === id);
      if (fromIndex < 0) {
        if (draft) pinCard(draft);
        return;
      }
      const [moved] = pinned.splice(fromIndex, 1);
      const over = event.target.closest('[data-stats-card]');
      const overIndex = over ? pinned.findIndex((card) => card.id === over.dataset.statsCard) : -1;
      if (overIndex >= 0) pinned.splice(overIndex, 0, moved);
      else pinned.push(moved);
      savePinnedCards(pinned);
      renderPinned();
    });
  };

  installDrop(personalizada);
  installDrop(body);

  const ask = async (promptText) => {
    const prompt = String(promptText || '').trim();
    if (!prompt) return;
    const row = document.createElement('p');
    row.className = 'stats-assistant__message';
    row.textContent = `Consulta: ${prompt}`;
    log.appendChild(row);
    if (sendBtn) sendBtn.disabled = true;
    try {
      const { text } = await chatCompletion({
        request: createAiRequest(),
        maxTokens: 420,
        messages: [
          {
            role: 'system',
            content:
              'Eres asistente clínico de estadísticas de Telar. Trabajas solo con el JSON de tendencias agregadas (sin nombres). Responde únicamente un JSON: {"title":"…","insight":"1-2 frases","chart":{"type":"bar"|"pie"|"stat","labels":["…"],"values":[n]}}. En ~90% de los casos chart debe existir: si hay números comparables o un desglose, grafica. Usa pie para composiciones, bar para comparar, stat para un único número. chart:null solo si la pregunta no se puede cuantificar con estos datos. values deben salir del contexto, no inventes conteos. Español profesional, sin markdown ni groserías.',
          },
          {
            role: 'user',
            content: `Contexto:\n${JSON.stringify(ctx)}\n\nPregunta:\n${prompt}`,
          },
        ],
      });
      const insight = withChartFallback(parseStatsInsight(text), prompt, ctx);
      const reply = document.createElement('p');
      reply.className = 'stats-assistant__message stats-assistant__message--ai';
      reply.textContent = insight.insight || 'Puedo preparar esa vista.';
      log.appendChild(reply);
      draft = {
        id: `ai-${Date.now()}`,
        title: insight.title,
        insight: insight.insight,
        prompt,
        chart: insight.chart,
        createdAt: new Date().toISOString(),
      };
      renderPreview();
    } catch (err) {
      const reply = document.createElement('p');
      reply.className = 'stats-assistant__message stats-assistant__message--error';
      reply.textContent = cleanAssistantText(err?.message) || 'No se pudo consultar la IA.';
      log.appendChild(reply);
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      log.scrollTop = log.scrollHeight;
    }
  };

  content.querySelectorAll('[data-stats-prompt]').forEach((button) => {
    button.addEventListener('click', () => {
      input.value = button.dataset.statsPrompt || '';
      void ask(input.value);
      input.value = '';
    });
  });
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = input.value;
    input.value = '';
    void ask(value);
  });

  renderPinned();
}
