import { bindAutoSave, collectFormData } from '../autobind.js';
import { tccHandoutDef } from '../tcc-handout-defs.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, parseJsonSafe } from '../utils.js';
import { workspaceAutoSaveStatus } from '../save-status.js';

function quizScore(quizDef, answers) {
  let correct = 0;
  let answered = 0;
  for (const q of quizDef) {
    const v = answers[q.key];
    if (v == null || v === '') continue;
    answered += 1;
    const opt = q.options.find((o) => o.v === v);
    if (opt?.correct) correct += 1;
  }
  return { correct, answered, total: quizDef.length };
}

function sectionFieldHtml(s, data) {
  const val = data[s.key] ?? '';
  const id = `tcc-${s.key}`;
  if (s.type === 'radio') {
    return `
      <fieldset class="form-group tcc-section">
        <legend class="tcc-section__label">${escapeHtml(s.title)}</legend>
        ${s.hint ? `<p class="tcc-section__hint">${escapeHtml(s.hint)}</p>` : ''}
        <div class="tcc-quiz__opts" role="radiogroup">
          ${(s.options || [])
            .map(
              (o) => `
            <label class="tcc-quiz__opt">
              <input type="radio" name="${s.key}" value="${o.v}" ${val === o.v ? 'checked' : ''} />
              <span>${escapeHtml(o.label)}</span>
            </label>`,
            )
            .join('')}
        </div>
      </fieldset>`;
  }
  if (s.type === 'number') {
    return `
      <div class="form-group tcc-section">
        <label for="${id}">${escapeHtml(s.title)}</label>
        ${s.hint ? `<p class="tcc-section__hint">${escapeHtml(s.hint)}</p>` : ''}
        <input type="number" id="${id}" name="${s.key}" min="${s.min ?? 0}" max="${s.max ?? 100}" step="1"
          value="${val !== '' && val != null ? escapeHtml(String(val)) : ''}" placeholder="0–100" />
      </div>`;
  }
  return `
    <div class="form-group tcc-section">
      <label for="${id}">${escapeHtml(s.title)}</label>
      ${s.hint ? `<p class="tcc-section__hint">${escapeHtml(s.hint)}</p>` : ''}
      <textarea id="${id}" name="${s.key}" rows="${s.rows || 4}" placeholder="Escriba aquí…">${escapeHtml(val)}</textarea>
    </div>`;
}

function quizHtml(quizDef, answers) {
  return quizDef
    .map(
      (q) => `
    <fieldset class="tcc-quiz__item">
      <legend class="tcc-quiz__prompt">${escapeHtml(q.prompt)}</legend>
      <div class="tcc-quiz__opts" role="radiogroup">
        ${q.options
          .map(
            (o) => `
          <label class="tcc-quiz__opt">
            <input type="radio" name="${q.key}" value="${o.v}" ${answers[q.key] === o.v ? 'checked' : ''} />
            <span>${escapeHtml(o.label)}</span>
          </label>`,
          )
          .join('')}
      </div>
    </fieldset>`,
    )
    .join('');
}

export async function renderTccGeneric(host, moduleRow) {
  const def = tccHandoutDef(moduleRow.module_type);
  if (!def) {
    host.innerHTML = `<div class="card"><p>Módulo TCC no configurado.</p></div>`;
    return;
  }

  const data = parseJsonSafe(moduleRow.data, {});
  const answers = data.quiz || {};
  const quizDef = def.quiz || [];
  const score = quizScore(quizDef, answers);

  host.innerHTML = `
    <div class="card tcc-module">
      <div class="module-card-head">
        <div>
          <h2 class="module-title" style="margin:0">${escapeHtml(def.title)}</h2>
          <p class="module-card-head__sub">Material TCC Telar — elaboración propia</p>
        </div>
        ${
          score.answered > 0
            ? `<div class="badge badge--info module-card-head__badge" title="Aciertos (profesional)">${score.correct}/${score.total}</div>`
            : ''
        }
      </div>
      <p class="tcc-intro">${escapeHtml(def.intro)}</p>
      ${def.warning ? `<p class="tcc-warning" role="note">${escapeHtml(def.warning)}</p>` : ''}
      ${(def.activityGroups || [])
        .map(
          (g) => `
        <section class="tcc-activities" aria-labelledby="tcc-act-${g.title.replace(/\s+/g, '-')}">
          <h3 class="tcc-activities__title" id="tcc-act-${g.title.replace(/\s+/g, '-')}">${escapeHtml(g.title)}</h3>
          <ul class="tcc-activities__list">
            ${g.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
          </ul>
        </section>`,
        )
        .join('')}
      <form id="tcc-generic-form">
        ${(def.sections || []).map((s) => sectionFieldHtml(s, data)).join('')}
        ${
          quizDef.length
            ? `
        <section class="tcc-quiz">
          <h3 class="tcc-quiz__title">Casos prácticos</h3>
          <p class="tcc-section__hint">Marque la única opción correcta en cada caso.</p>
          ${quizHtml(quizDef, answers)}
        </section>`
            : ''
        }
      </form>
    </div>`;

  const form = host.querySelector('#tcc-generic-form');

  const persist = async () => {
    const fd = collectFormData(form);
    const payload = Object.fromEntries(fd.entries());
    const quiz = { ...(data.quiz || {}) };
    for (const q of quizDef) {
      if (payload[q.key] != null) quiz[q.key] = payload[q.key];
      delete payload[q.key];
    }
    if (quizDef.length) payload.quiz = quiz;
    await syncModuleReadableText(moduleRow, payload, 'completado');

    const s = quizScore(quizDef, quiz);
    const badge = host.querySelector('.module-card-head__badge');
    if (s.answered > 0) {
      const label = `${s.correct}/${s.total}`;
      if (badge) badge.textContent = label;
      else {
        host.querySelector('.module-card-head')?.insertAdjacentHTML(
          'beforeend',
          `<div class="badge badge--info module-card-head__badge" title="Aciertos (profesional)">${label}</div>`,
        );
      }
    }
  };

  bindAutoSave(form, persist, workspaceAutoSaveStatus());
}
