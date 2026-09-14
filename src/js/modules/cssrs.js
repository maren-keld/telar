import { bindAutoSave, collectFormData } from '../autobind.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, parseJsonSafe } from '../utils.js';
import { workspaceAutoSaveStatus } from '../save-status.js';
import { getLocale, t } from '../i18n.js';

/**
 * C-SSRS Screener (Screen Version — Recent / past month).
 * Wording © The Research Foundation for Mental Hygiene, Inc. / Columbia Lighthouse Project.
 * Free clinical use authorized for Telar (Columbia reply 2026-09-14).
 */

const QUESTIONS = [
  {
    id: 'q1',
    en: 'Have you wished you were dead or wished you could go to sleep and not wake up?',
    es: '¿Ha deseado estar muerto/a o ha deseado poder dormirse y no despertar?',
  },
  {
    id: 'q2',
    en: 'Have you actually had any thoughts of killing yourself?',
    es: '¿Ha tenido realmente pensamientos de suicidarse?',
  },
  {
    id: 'q3',
    en: 'Have you been thinking about how you might do this?',
    es: '¿Ha estado pensando en cómo podría hacerlo?',
    hintEn:
      'E.g. “I thought about taking an overdose but I never made a specific plan as to when where or how I would actually do it…and I would never go through with it.”',
    hintEs:
      'Ej.: “Pensé en tomar una sobredosis pero nunca hice un plan concreto de cuándo, dónde o cómo lo haría… y nunca lo llevaría a cabo.”',
  },
  {
    id: 'q4',
    en: 'Have you had these thoughts and had some intention of acting on them?',
    es: '¿Ha tenido estos pensamientos y alguna intención de actuar según ellos?',
    hintEn: 'As opposed to “I have the thoughts but I definitely will not do anything about them.”',
    hintEs: 'A diferencia de “tengo los pensamientos pero definitivamente no haré nada al respecto.”',
  },
  {
    id: 'q5',
    en: 'Have you started to work out or worked out the details of how to kill yourself? Do you intend to carry out this plan?',
    es: '¿Ha empezado a elaborar o ha elaborado los detalles de cómo suicidarse? ¿Tiene intención de llevar a cabo este plan?',
  },
  {
    id: 'q6',
    en: 'Have you ever done anything, started to do anything, or prepared to do anything to end your life?',
    es: '¿Ha hecho alguna vez algo, empezado a hacer algo o se ha preparado para hacer algo para acabar con su vida?',
    hintEn:
      'Examples: collected pills, obtained a gun, gave away valuables, wrote a will or suicide note, took out pills but didn’t swallow any, held a gun but changed your mind, went to the roof but didn’t jump; or actually took pills, tried to shoot yourself, cut yourself, tried to hang yourself, etc.',
    hintEs:
      'Ejemplos: reunir pastillas, conseguir un arma, regalar objetos de valor, escribir un testamento o una nota, sacar pastillas sin ingerirlas, sostener un arma y cambiar de idea, subir a un techo sin saltar; o haber tomado pastillas, intentado dispararse, cortarse, ahorcarse, etc.',
  },
];

function yn(value) {
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
  if (a.q4 === 'yes' || a.q5 === 'yes' || (a.q6 === 'yes' && recent)) {
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

function bandLabel(band) {
  return t(band.labelKey, useEnglish() ? band.labelEn : band.label);
}

function rowHtml(q, selected) {
  const hint = qHint(q);
  const yesChecked = selected === 'yes' ? 'checked' : '';
  const noChecked = selected === 'no' ? 'checked' : '';
  const yes = useEnglish() ? 'Yes' : 'Sí';
  const no = useEnglish() ? 'No' : 'No';
  return `
    <fieldset class="cssrs-row" data-cssrs-q="${q.id}">
      <legend class="cssrs-row__q">
        <span class="cssrs-row__n">${q.id.replace('q', '')}.</span>
        <span>${escapeHtml(qText(q))}</span>
      </legend>
      ${hint ? `<p class="cssrs-row__hint text-muted">${escapeHtml(hint)}</p>` : ''}
      <div class="cssrs-row__opts" role="radiogroup" aria-label="${escapeHtml(qText(q))}">
        <label class="likert-opt"><input type="radio" name="${q.id}" value="yes" ${yesChecked} /><span>${escapeHtml(yes)}</span></label>
        <label class="likert-opt"><input type="radio" name="${q.id}" value="no" ${noChecked} /><span>${escapeHtml(no)}</span></label>
      </div>
    </fieldset>`;
}

export async function renderCssrs(host, moduleRow) {
  const data = parseJsonSafe(moduleRow.data, {});
  const answers = { ...(data.answers || {}) };
  const band0 = cssrsRiskBand(answers);
  const yes = useEnglish() ? 'Yes' : 'Sí';
  const no = useEnglish() ? 'No' : 'No';

  host.innerHTML = `
    <div class="card psych-module cssrs-module">
      <div class="psych-module__head">
        <div class="module-card-head">
          <div>
            <h2 class="module-title">${escapeHtml(t('cssrs.title', 'C-SSRS Screener'))}</h2>
            <p class="module-card-head__sub">${escapeHtml(
              t(
                'cssrs.subtitle',
                'Columbia-Suicide Severity Rating Scale · Screen Version — Recent (past month).',
              ),
            )}</p>
          </div>
          <div class="psych-score-pill ${band0.cls}" id="cssrs-pill">
            <span class="psych-score-pill__label">${escapeHtml(t('cssrs.triage', 'Triage'))}</span>
            <strong id="cssrs-band">${escapeHtml(bandLabel(band0))}</strong>
          </div>
        </div>
      </div>
      <div class="psych-module__scroll">
        <form id="cssrs-form" class="cssrs-form">
          <p class="cssrs-instruction text-muted">${escapeHtml(
            t('cssrs.instruction', 'Ask the bolded items. Timeframe: past month (unless noted).'),
          )}</p>
          ${QUESTIONS.map((q) => rowHtml(q, yn(answers[q.id]))).join('')}
          <fieldset class="cssrs-row" data-cssrs-q="q6_recent" id="cssrs-q6-recent">
            <legend class="cssrs-row__q">${escapeHtml(
              t('cssrs.q6recent', 'If yes to item 6: was this within the past three months?'),
            )}</legend>
            <div class="cssrs-row__opts" role="radiogroup">
              <label class="likert-opt"><input type="radio" name="q6_recent" value="yes" ${
                yn(answers.q6_recent) === 'yes' ? 'checked' : ''
              } /><span>${escapeHtml(yes)}</span></label>
              <label class="likert-opt"><input type="radio" name="q6_recent" value="no" ${
                yn(answers.q6_recent) === 'no' ? 'checked' : ''
              } /><span>${escapeHtml(no)}</span></label>
            </div>
          </fieldset>
        </form>
        <p class="cssrs-note">${escapeHtml(
          t(
            'cssrs.note',
            '© 2008 The Research Foundation for Mental Hygiene, Inc. Free clinical use authorized by The Columbia Lighthouse Project. Not a substitute for full clinical assessment; activate safety protocol on high risk.',
          ),
        )}</p>
      </div>
    </div>`;

  const form = host.querySelector('#cssrs-form');
  const pill = host.querySelector('#cssrs-pill');
  const bandEl = host.querySelector('#cssrs-band');
  const recentFs = host.querySelector('#cssrs-q6-recent');

  const syncVisibility = () => {
    const showFollow = yn(answers.q2) === 'yes';
    for (const id of ['q3', 'q4', 'q5']) {
      const el = form.querySelector(`[data-cssrs-q="${id}"]`);
      if (el) el.hidden = !showFollow;
    }
    if (recentFs) recentFs.hidden = yn(answers.q6) !== 'yes';
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
    if (yn(next.q6) !== 'yes') delete next.q6_recent;
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
