import { bindAutoSave, collectFormData } from '../autobind.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, parseJsonSafe } from '../utils.js';
import { workspaceAutoSaveStatus } from '../save-status.js';
import { getLocale, t } from '../i18n.js';

/**
 * C-SSRS Screener (Screen Version — Recent).
 * Wording © The Research Foundation for Mental Hygiene, Inc. / Columbia Lighthouse Project.
 * Free clinical use authorized for Telar (Columbia reply 2026-09-14).
 *
 * Branching (screener): always 1–2 (past month). If Q2=Yes → 3–5; else skip to 6.
 * Q6 always: lifetime + past 3 months.
 */

export const QUESTIONS = [
  {
    id: 'q1',
    tint: 'yellow',
    en: 'Have you wished you were dead or wished you could go to sleep and not wake up?',
    es: '¿Ha deseado estar muerto/a o ha deseado poder dormirse y no despertar?',
  },
  {
    id: 'q2',
    tint: 'yellow',
    en: 'Have you actually had any thoughts of killing yourself?',
    es: '¿Ha tenido realmente pensamientos de suicidarse?',
  },
  {
    id: 'q3',
    tint: 'orange',
    follow: true,
    en: 'Have you been thinking about how you might do this?',
    es: '¿Ha estado pensando en cómo podría hacerlo?',
    hintEn:
      'E.g. “I thought about taking an overdose but I never made a specific plan as to when where or how I would actually do it…and I would never go through with it.”',
    hintEs:
      'Ej.: “Pensé en tomar una sobredosis pero nunca hice un plan concreto de cuándo, dónde o cómo lo haría… y nunca lo llevaría a cabo.”',
  },
  {
    id: 'q4',
    tint: 'red',
    follow: true,
    high: true,
    en: 'Have you had these thoughts and had some intention of acting on them?',
    es: '¿Ha tenido estos pensamientos y alguna intención de actuar según ellos?',
    hintEn: 'As opposed to “I have the thoughts but I definitely will not do anything about them.”',
    hintEs: 'A diferencia de “tengo los pensamientos pero definitivamente no haré nada al respecto.”',
  },
  {
    id: 'q5',
    tint: 'red',
    follow: true,
    high: true,
    en: 'Have you started to work out or worked out the details of how to kill yourself? Do you intend to carry out this plan?',
    es: '¿Ha empezado a elaborar o ha elaborado los detalles de cómo suicidarse? ¿Tiene intención de llevar a cabo este plan?',
  },
  {
    id: 'q6',
    tint: 'split',
    dual: true,
    en: 'Have you ever done anything, started to do anything, or prepared to do anything to end your life?',
    es: '¿Ha hecho alguna vez algo, empezado a hacer algo o se ha preparado para hacer algo para acabar con su vida?',
    hintEn:
      'Examples: collected pills, obtained a gun, gave away valuables, wrote a will or suicide note, took out pills but didn’t swallow any, held a gun but changed your mind, went to the roof but didn’t jump; or actually took pills, tried to shoot yourself, cut yourself, tried to hang yourself, etc.',
    hintEs:
      'Ejemplos: reunir pastillas, conseguir un arma, regalar objetos de valor, escribir un testamento o una nota, sacar pastillas sin ingerirlas, sostener un arma y cambiar de idea, subir a un techo sin saltar; o haber tomado pastillas, intentado dispararse, cortarse, ahorcarse, etc.',
  },
];

export function yn(value) {
  if (value === true || value === 'yes' || value === '1' || value === 1) return 'yes';
  if (value === false || value === 'no' || value === '0' || value === 0) return 'no';
  return null;
}

function useEnglish() {
  return getLocale() === 'en';
}

function qText(q) {
  return useEnglish() ? q.en : q.es;
}

function qHint(q) {
  if (useEnglish()) return q.hintEn || '';
  return q.hintEs || q.hintEn || '';
}

export function cssrsRiskBand(answers) {
  const a = Object.fromEntries(QUESTIONS.map((q) => [q.id, yn(answers[q.id])]));
  const recent = yn(answers.q6_recent) === 'yes';
  if (a.q4 === 'yes' || a.q5 === 'yes' || recent) {
    return { key: 'high', labelKey: 'cssrs.risk.high', label: 'Riesgo alto', labelEn: 'High risk', cls: 'cssrs-band--high' };
  }
  if (a.q2 === 'yes' || a.q3 === 'yes' || a.q6 === 'yes') {
    return {
      key: 'moderate',
      labelKey: 'cssrs.risk.moderate',
      label: 'Riesgo moderado',
      labelEn: 'Moderate risk',
      cls: 'cssrs-band--moderate',
    };
  }
  if (a.q1 === 'yes') {
    return { key: 'low', labelKey: 'cssrs.risk.low', label: 'Riesgo bajo', labelEn: 'Low risk', cls: 'cssrs-band--low' };
  }
  return {
    key: 'none',
    labelKey: 'cssrs.risk.none',
    label: 'Sin indicadores positivos',
    labelEn: 'No positive indicators',
    cls: 'cssrs-band--none',
  };
}

export function cssrsBandScore(key) {
  if (key === 'high') return 3;
  if (key === 'moderate') return 2;
  if (key === 'low') return 1;
  return 0;
}

function bandLabel(band) {
  return t(band.labelKey, useEnglish() ? band.labelEn : band.label);
}

function ynOpts(name, selected, aria) {
  const yes = useEnglish() ? 'Yes' : 'Sí';
  const no = useEnglish() ? 'No' : 'No';
  const yesChecked = selected === 'yes' ? 'checked' : '';
  const noChecked = selected === 'no' ? 'checked' : '';
  return `
    <div class="likert-row__opts cssrs-yn" role="radiogroup" aria-label="${escapeHtml(aria)}">
      <label class="likert-opt gad7-opt cssrs-opt" title="${escapeHtml(yes)}" aria-label="${escapeHtml(yes)}">
        <input type="radio" name="${name}" value="yes" ${yesChecked} />
        <span class="likert-dot"></span>
      </label>
      <label class="likert-opt gad7-opt cssrs-opt" title="${escapeHtml(no)}" aria-label="${escapeHtml(no)}">
        <input type="radio" name="${name}" value="no" ${noChecked} />
        <span class="likert-dot"></span>
      </label>
    </div>`;
}

function rowHtml(q, answers) {
  const hint = qHint(q);
  const n = q.id.replace('q', '');
  const tint = q.tint || 'yellow';
  const dual = Boolean(q.dual);
  return `
    <div class="likert-row cssrs-row cssrs-row--${tint}${q.follow ? ' cssrs-row--follow' : ''}" data-cssrs-q="${q.id}">
      <div class="likert-row__q">
        <span class="likert-row__n">${n}.</span>
        <span>${escapeHtml(qText(q))}</span>
        ${q.high ? `<span class="cssrs-high-tag">${escapeHtml(useEnglish() ? 'High risk' : 'Riesgo alto')}</span>` : ''}
      </div>
      ${hint ? `<p class="cssrs-row__hint text-muted">${escapeHtml(hint)}</p>` : ''}
      ${
        dual
          ? `<div class="cssrs-dual">
              <div class="cssrs-tf cssrs-tf--lifetime">
                <span class="cssrs-tf__label">${escapeHtml(useEnglish() ? 'Lifetime' : 'Alguna vez')}</span>
                ${ynOpts(q.id, yn(answers[q.id]), qText(q))}
              </div>
              <div class="cssrs-tf cssrs-tf--recent">
                <span class="cssrs-tf__label">${escapeHtml(useEnglish() ? 'Past 3 months' : 'Últimos 3 meses')}</span>
                ${ynOpts('q6_recent', yn(answers.q6_recent), useEnglish() ? 'Past 3 months' : 'Últimos 3 meses')}
              </div>
            </div>`
          : `<div class="cssrs-tf cssrs-tf--month">
              ${ynOpts(q.id, yn(answers[q.id]), qText(q))}
            </div>`
      }
    </div>`;
}

export async function renderCssrs(host, moduleRow) {
  const data = parseJsonSafe(moduleRow.data, {});
  const answers = { ...(data.answers || {}) };
  const band0 = cssrsRiskBand(answers);
  const yes = useEnglish() ? 'Yes' : 'Sí';
  const no = useEnglish() ? 'No' : 'No';

  host.innerHTML = `
    <div class="card psych-module cssrs-module gad7-module">
      <div class="psych-module__head">
        <div class="module-card-head">
          <div>
            <h2 class="module-title">${escapeHtml(t('cssrs.title', 'C-SSRS'))}</h2>
          </div>
          <div class="psych-score-pill ${band0.cls}" id="cssrs-pill" aria-label="Banda de riesgo actual">
            <strong id="cssrs-band">${escapeHtml(bandLabel(band0))}</strong>
          </div>
        </div>
      </div>
      <div class="psych-module__scroll">
        <form id="cssrs-form" class="likert-form gad7-form cssrs-form">
          <p class="cssrs-instruction text-muted">${escapeHtml(
            t(
              'cssrs.instruction',
              'Siempre preguntar 1 y 2 (último mes). Si SÍ en 2, preguntar 3–5; si NO, pasar al 6. El 6 cubre alguna vez (vida) y los últimos 3 meses.',
            ),
          )}</p>
          <div class="likert-head gad7-head cssrs-head cssrs-head--month">
            <div class="likert-head__q">${escapeHtml(t('cssrs.item', 'Ítem'))}</div>
            <div class="likert-head__opts cssrs-head__opts">
              <span class="cssrs-head__window">${escapeHtml(t('cssrs.window.month', 'Último mes'))}</span>
              <span>${escapeHtml(yes)}</span>
              <span>${escapeHtml(no)}</span>
            </div>
          </div>
          ${QUESTIONS.filter((q) => !q.dual)
            .map((q) => rowHtml(q, answers))
            .join('')}
          <div class="likert-head gad7-head cssrs-head cssrs-head--q6">
            <div class="likert-head__q">${escapeHtml(t('cssrs.item6', 'Ítem 6 · siempre preguntar'))}</div>
            <div class="cssrs-head__dual">
              <div class="cssrs-head__dual-col">
                <span class="cssrs-head__dual-window">${escapeHtml(t('cssrs.window.lifetime', 'Alguna vez'))}</span>
                <span class="cssrs-head__dual-yn">${escapeHtml(yes)}</span>
                <span class="cssrs-head__dual-yn">${escapeHtml(no)}</span>
              </div>
              <div class="cssrs-head__dual-col">
                <span class="cssrs-head__dual-window">${escapeHtml(t('cssrs.window.recent', 'Últimos 3 meses'))}</span>
                <span class="cssrs-head__dual-yn">${escapeHtml(yes)}</span>
                <span class="cssrs-head__dual-yn">${escapeHtml(no)}</span>
              </div>
            </div>
          </div>
          ${QUESTIONS.filter((q) => q.dual)
            .map((q) => rowHtml(q, answers))
            .join('')}
        </form>
        <p class="cssrs-note">${escapeHtml(
          t(
            'cssrs.note',
            '© 2008 The Research Foundation for Mental Hygiene, Inc. Uso clínico gratuito autorizado por The Columbia Lighthouse Project. No sustituye evaluación clínica; activar protocolo de seguridad si hay riesgo alto.',
          ),
        )}</p>
      </div>
    </div>`;

  const form = host.querySelector('#cssrs-form');
  const pill = host.querySelector('#cssrs-pill');
  const bandEl = host.querySelector('#cssrs-band');

  const syncVisibility = () => {
    const showFollow = yn(answers.q2) === 'yes';
    form.querySelectorAll('.cssrs-row--follow').forEach((el) => {
      el.hidden = !showFollow;
    });
  };

  const readForm = () => {
    const fd = collectFormData(form);
    const next = { ...answers };
    for (const q of QUESTIONS) {
      if (fd[q.id] !== undefined) next[q.id] = fd[q.id];
    }
    if (fd.q6_recent !== undefined) next.q6_recent = fd.q6_recent;
    if (yn(next.q2) !== 'yes') {
      delete next.q3;
      delete next.q4;
      delete next.q5;
    }
    Object.keys(answers).forEach((k) => delete answers[k]);
    Object.assign(answers, next);
  };

  const recompute = () => {
    readForm();
    syncVisibility();
    const band = cssrsRiskBand(answers);
    if (bandEl) bandEl.textContent = bandLabel(band);
    if (pill) pill.className = `psych-score-pill ${band.cls}`;
  };

  const persist = async () => {
    readForm();
    const triage = cssrsRiskBand(answers);
    await syncModuleReadableText(
      moduleRow,
      { answers: { ...answers }, triage: triage.key, triageLabel: triage.label },
      'completado',
    );
  };

  bindAutoSave(form, persist, workspaceAutoSaveStatus());
  form.addEventListener('change', recompute);
  syncVisibility();
}
