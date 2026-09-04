/**
 * Página que responde el paciente: /r/<token>#<llave>
 *
 * El servidor entrega un sobre encriptado que solo se puede abrir con la llave del
 * fragmento. Aquí no se muestra ningún puntaje ni interpretación: eso es del
 * terapeuta. Al enviar, las respuestas se encriptan con la misma llave.
 */
import { decryptShare, encryptShare } from './share-crypto.js';
import { optionsForItem, questionnaireItems, sliderRange } from './questionnaire-schema.js';

const el = (id) => document.getElementById(id);

function fail(title, text) {
  el('loading').hidden = true;
  el('form-host').hidden = true;
  el('bar').hidden = true;
  el('fail').hidden = false;
  if (title) el('fail-title').textContent = title;
  if (text) el('fail-text').textContent = text;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function tokenFromPath() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  return parts[parts.length - 1] === 'r' ? '' : parts[parts.length - 1] || '';
}

function keyFromFragment() {
  return window.location.hash.replace(/^#/, '').trim();
}

/* --------------------------- cuestionarios ---------------------------- */

function itemHtml(def, item) {
  const opts = optionsForItem(def, item.index);
  if (!opts.length) {
    const { min, max, step } = sliderRange(item);
    const mid = Math.round((min + max) / 2);
    return `
      <div class="item" data-item="${item.index}">
        <div class="item__q"><span class="item__n">${item.index + 1}.</span><span>${escapeHtml(item.text)}</span></div>
        <div class="slider-row">
          <input type="range" name="q${item.index}" min="${min}" max="${max}" step="${step}"
                 value="${mid}" data-empty="1" />
          <output class="slider-out">—</output>
        </div>
        <div class="slider-labels">
          <span>${escapeHtml(item.minLabel || String(min))}</span>
          <span>${escapeHtml(item.maxLabel || String(max))}</span>
        </div>
      </div>`;
  }
  return `
    <div class="item" data-item="${item.index}">
      <div class="item__q"><span class="item__n">${item.index + 1}.</span><span>${escapeHtml(item.text)}</span></div>
      <div class="opts" role="radiogroup" aria-label="Pregunta ${item.index + 1}">
        ${opts
          .map(
            (o) => `<label class="opt">
          <input type="radio" name="q${item.index}" value="${escapeHtml(String(o.v))}" />
          <span>${escapeHtml(o.label)}</span>
        </label>`,
          )
          .join('')}
      </div>
    </div>`;
}

function renderQuestionnaire(def, onSubmit) {
  const items = questionnaireItems(def);
  const host = el('form-host');
  host.innerHTML = `
    <div class="card">
      <h1>${escapeHtml(def.title || 'Cuestionario')}</h1>
      ${def.subtitle ? `<p class="sub">${escapeHtml(def.subtitle)}</p>` : ''}
      ${def.instructions ? `<p class="instructions">${escapeHtml(def.instructions)}</p>` : ''}
    </div>
    <form class="card" id="q-form">
      ${items.map((item) => itemHtml(def, item)).join('')}
    </form>
    <p class="note">Tus respuestas se encriptan en este dispositivo y solo las puede abrir tu terapeuta.
      Esto no es un diagnóstico ni reemplaza una evaluación clínica.</p>`;

  const form = el('q-form');
  const readAnswers = () =>
    items.map((item) => {
      const range = form.querySelector(`input[type=range][name="q${item.index}"]`);
      if (range) return range.dataset.empty === '1' ? null : Number(range.value);
      const checked = form.querySelector(`input[name="q${item.index}"]:checked`);
      return checked ? Number(checked.value) : null;
    });

  const refresh = () => {
    const answers = readAnswers();
    const answered = answers.filter((v) => v !== null).length;
    el('count').textContent = `${answered} de ${items.length} respondidas`;
    el('send').disabled = answered === 0;
  };

  form.addEventListener('input', (event) => {
    const target = event.target;
    if (target.type === 'range') {
      target.dataset.empty = '0';
      const out = target.parentElement?.querySelector('.slider-out');
      if (out) out.textContent = target.value;
    }
    refresh();
  });
  form.addEventListener('change', refresh);

  el('send').addEventListener('click', () => {
    const answers = readAnswers();
    const missing = answers.findIndex((v) => v === null);
    if (missing >= 0) {
      const node = form.querySelector(`[data-item="${missing}"]`);
      node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el('count').textContent = `Falta la pregunta ${missing + 1}`;
      return;
    }
    onSubmit({ answers });
  });

  el('loading').hidden = true;
  host.hidden = false;
  el('bar').hidden = false;
  refresh();
}

/* ------------------------ handout TCC / narrativa --------------------- */

function fieldFilled(form, field) {
  const name = field.name || field.key;
  if (field.type === 'radio') {
    return Boolean(form.querySelector(`input[name="${CSS.escape(name)}"]:checked`));
  }
  const input = form.querySelector(`[name="${CSS.escape(name)}"]`);
  return Boolean(String(input?.value || '').trim());
}

function readField(form, field) {
  const name = field.name || field.key;
  if (field.type === 'radio') {
    const checked = form.querySelector(`input[name="${CSS.escape(name)}"]:checked`);
    return checked ? checked.value : '';
  }
  const input = form.querySelector(`[name="${CSS.escape(name)}"]`);
  return String(input?.value || '');
}

function sectionHtml(s) {
  const hint = s.hint ? `<p class="hint">${escapeHtml(s.hint)}</p>` : '';
  if (s.type === 'radio') {
    return `
      <div class="field" data-field="${escapeHtml(s.key)}">
        <p class="field__label">${escapeHtml(s.title)}</p>
        ${hint}
        <div class="opts" role="radiogroup" aria-label="${escapeHtml(s.title)}">
          ${(s.options || [])
            .map(
              (o) => `<label class="opt">
            <input type="radio" name="${escapeHtml(s.key)}" value="${escapeHtml(o.v)}" />
            <span>${escapeHtml(o.label)}</span>
          </label>`,
            )
            .join('')}
        </div>
      </div>`;
  }
  if (s.type === 'number') {
    const min = Number.isFinite(s.min) ? s.min : 0;
    const max = Number.isFinite(s.max) ? s.max : 100;
    return `
      <div class="field" data-field="${escapeHtml(s.key)}">
        <label class="field__label" for="f-${escapeHtml(s.key)}">${escapeHtml(s.title)}</label>
        ${hint}
        <input class="hw-num" type="number" inputmode="numeric" id="f-${escapeHtml(s.key)}"
               name="${escapeHtml(s.key)}" min="${min}" max="${max}" step="1" placeholder="${min}–${max}" />
      </div>`;
  }
  const rows = Math.min(Math.max(Number(s.rows) || 4, 2), 12);
  return `
    <div class="field" data-field="${escapeHtml(s.key)}">
      <label class="field__label" for="f-${escapeHtml(s.key)}">${escapeHtml(s.title)}</label>
      ${hint}
      <textarea class="hw" id="f-${escapeHtml(s.key)}" name="${escapeHtml(s.key)}" rows="${rows}"
                placeholder="Escribe aquí…"></textarea>
    </div>`;
}

function quizName(key) {
  return `quiz__${key}`;
}

function quizItemHtml(q) {
  const name = quizName(q.key);
  return `
    <div class="field" data-quiz="${escapeHtml(q.key)}">
      <p class="field__label">${escapeHtml(q.prompt)}</p>
      <div class="opts" role="radiogroup" aria-label="${escapeHtml(q.prompt)}">
        ${(q.options || [])
          .map(
            (o) => `<label class="opt">
          <input type="radio" name="${escapeHtml(name)}" value="${escapeHtml(o.v)}" />
          <span>${escapeHtml(o.label)}</span>
        </label>`,
          )
          .join('')}
      </div>
    </div>`;
}

function renderHandout(payload, onSubmit) {
  const sections = payload.sections || [];
  const quiz = payload.quiz || [];
  const groups = payload.activityGroups || [];
  const total = sections.length + quiz.length;
  const host = el('form-host');

  host.innerHTML = `
    <div class="card">
      <h1>${escapeHtml(payload.title || 'Tarea')}</h1>
      ${payload.subtitle ? `<p class="sub">${escapeHtml(payload.subtitle)}</p>` : ''}
      ${payload.intro ? `<p class="instructions">${escapeHtml(payload.intro)}</p>` : ''}
    </div>
    ${payload.warning ? `<div class="card warn" role="note">${escapeHtml(payload.warning)}</div>` : ''}
    ${groups
      .map(
        (g) => `
      <div class="card acts">
        ${g.title ? `<h2>${escapeHtml(g.title)}</h2>` : ''}
        <ul>${(g.items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      </div>`,
      )
      .join('')}
    <form class="card" id="q-form">
      ${sections.map((s) => sectionHtml(s)).join('')}
      ${
        quiz.length
          ? `<h2 class="quiz-title">Casos prácticos</h2>
             <p class="hint">Marca una opción en cada caso.</p>
             ${quiz.map((q) => quizItemHtml(q)).join('')}`
          : ''
      }
    </form>
    <p class="note">Lo que escribas se encripta en este dispositivo y solo lo puede abrir tu terapeuta.
      Esto no es un diagnóstico ni reemplaza una evaluación clínica.</p>`;

  const form = el('q-form');
  const checklist = [
    ...sections.map((s) => ({ kind: 'field', key: s.key, type: s.type })),
    ...quiz.map((q) => ({ kind: 'quiz', key: q.key, name: quizName(q.key), type: 'radio' })),
  ];

  const refresh = () => {
    const answered = checklist.filter((item) => fieldFilled(form, item)).length;
    el('count').textContent = `${answered} de ${total} completadas`;
    el('send').disabled = answered === 0;
  };

  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);

  el('send').addEventListener('click', () => {
    const missing = checklist.find((item) => !fieldFilled(form, item));
    if (missing) {
      const sel =
        missing.kind === 'quiz'
          ? `[data-quiz="${CSS.escape(missing.key)}"]`
          : `[data-field="${CSS.escape(missing.key)}"]`;
      form.querySelector(sel)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el('count').textContent = 'Falta completar un apartado';
      return;
    }
    const fields = {};
    for (const s of sections) fields[s.key] = readField(form, s);
    const quizAnswers = {};
    for (const q of quiz) quizAnswers[q.key] = readField(form, { name: quizName(q.key), type: 'radio' });
    onSubmit({ fields, quiz: quiz.length ? quizAnswers : undefined });
  });

  el('loading').hidden = true;
  host.hidden = false;
  el('bar').hidden = false;
  refresh();
}

/* ------------------------ experiencia interactiva --------------------- */

function renderExperience(payload, onSubmit) {
  const host = el('form-host');
  host.innerHTML = `
    <div class="card">
      <h1>${escapeHtml(payload.title || 'Experiencia')}</h1>
      ${payload.instructions ? `<p class="instructions">${escapeHtml(payload.instructions)}</p>` : ''}
    </div>
    <div class="card">
      <iframe class="experience" id="exp" title="${escapeHtml(payload.title || 'Experiencia')}"
              sandbox="allow-scripts allow-forms allow-pointer-lock" referrerpolicy="no-referrer"></iframe>
    </div>
    <p class="note">Lo que registres se encripta en este dispositivo y solo lo puede abrir tu terapeuta.</p>`;

  const frame = el('exp');
  let latest = null;

  // El bridge es el mismo que dentro de la app: Telar.save / done / resize.
  const bridge = `<script>(function(){
    function post(kind, payload){ try { parent.postMessage({ __telar_bridge__: 1, kind: kind, payload: payload }, '*'); } catch (e) {} }
    window.Telar = {
      load: function(){ return null; },
      save: function(d){ post('save', d); },
      done: function(s){ post('done', s); },
      resize: function(h){ post('resize', Number(h) || 0); }
    };
    window.addEventListener('load', function(){ post('resize', document.documentElement.scrollHeight); });
  })();</scr` + `ipt>`;

  window.addEventListener('message', (event) => {
    if (event.source !== frame.contentWindow) return;
    const msg = event.data;
    if (!msg || msg.__telar_bridge__ !== 1) return;
    if (msg.kind === 'resize') {
      frame.style.minHeight = `${Math.min(Math.max(Number(msg.payload) || 520, 240), 1400)}px`;
      return;
    }
    if (msg.kind === 'save') latest = msg.payload;
    if (msg.kind === 'done') onSubmit({ payload: latest, summary: msg.payload || '' });
  });

  frame.srcdoc = String(payload.html || '').includes('<html')
    ? String(payload.html).replace(/<head([^>]*)>/i, `<head$1>${bridge}`)
    : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${bridge}</head><body>${payload.html || ''}</body></html>`;

  el('loading').hidden = true;
  host.hidden = false;
  el('bar').hidden = false;
  el('count').textContent = 'Cuando termines, envía tu registro';
  el('send').addEventListener('click', () => onSubmit({ payload: latest, summary: '' }));
}

/* -------------------------------- flujo ------------------------------- */

async function main() {
  const token = tokenFromPath();
  const key = keyFromFragment();

  if (!token) return fail('Enlace incompleto', 'Vuelve a abrir el enlace que te enviaron.');
  if (!key) {
    return fail(
      'Falta parte del enlace',
      'Copia y pega el enlace completo, incluyendo todo lo que viene después del #.',
    );
  }

  let res;
  try {
    res = await fetch(`/api/share/${encodeURIComponent(token)}`, { cache: 'no-store' });
  } catch {
    return fail('Sin conexión', 'Revisa tu internet y vuelve a abrir el enlace.');
  }

  if (res.status === 409) {
    el('loading').hidden = true;
    el('done').hidden = false;
    return undefined;
  }
  if (!res.ok) return fail();

  let payload;
  try {
    const body = await res.json();
    payload = await decryptShare(key, body.payload_ct);
  } catch {
    return fail(
      'No se pudo abrir el cuestionario',
      'El enlace puede estar incompleto o cortado. Pídele a tu terapeuta que te lo reenvíe.',
    );
  }

  const submit = async (answerPayload) => {
    const button = el('send');
    button.disabled = true;
    button.textContent = 'Enviando…';
    try {
      const response_ct = await encryptShare(key, answerPayload);
      const sent = await fetch(`/api/share/${encodeURIComponent(token)}/response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response_ct }),
      });
      if (!sent.ok && sent.status !== 409) throw new Error(String(sent.status));
      el('form-host').hidden = true;
      el('bar').hidden = true;
      el('done').hidden = false;
    } catch {
      button.disabled = false;
      button.textContent = 'Enviar respuestas';
      el('count').textContent = 'No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.';
    }
  };

  if (payload.kind === 'interactive') renderExperience(payload, submit);
  else if (payload.kind === 'handout') renderHandout(payload, submit);
  else renderQuestionnaire(payload.def || payload, submit);
  return undefined;
}

void main();
