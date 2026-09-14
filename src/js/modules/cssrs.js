import { bindAutoSave, collectFormData } from '../autobind.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, parseJsonSafe } from '../utils.js';
import { workspaceAutoSaveStatus } from '../save-status.js';
import { getLocale, t } from '../i18n.js';

/**
 * C-SSRS Screener (Screen Version — Recent / past month).
 * Wording © The Research Foundation for Mental Hygiene, Inc. / Columbia Lighthouse Project.
 * Free clinical use authorized for Telar (Columbia reply 2026-09-14).
 * UI alineada a GAD-7/DASS: Sí/No en columnas, timeframes y triage por color.
 */

const QUESTIONS = [
  {
    id: 'q1',
    band: 'low',
    timeframe: 'month',
    en: 'Have you wished you were dead or wished you could go to sleep and not wake up?',
    es: '¿Ha deseado estar muerto/a o ha deseado poder dormirse y no despertar?',
  },
  {
    id: 'q2',
    band: 'low',
    timeframe: 'month',
    en: 'Have you actually had any thoughts of killing yourself?',
    es: '¿Ha tenido realmente pensamientos de suicidarse?',
  },
  {
    id: 'q3',
    band: 'moderate',
    timeframe: 'month',
    branch: true,
    en: 'Have you been thinking about how you might do this?',
    es: '¿Ha estado pensando en cómo podría hacerlo?',
    hintEn:
      'E.g. “I thought about taking an overdose but I never made a specific plan as to when where or how I would actually do it…and I would never go through with it.”',
    hintEs:
      'Ej.: “Pensé en tomar una sobredosis pero nunca hice un plan concreto de cuándo, dónde o cómo lo haría… y nunca lo llevaría a cabo.”',
  },
  {
    id: 'q4',
    band: 'high',
    timeframe: 'month',
    branch: true,
    en: 'Have you had these thoughts and had some intention of acting on them?',
    es: '¿Ha tenido estos pensamientos y alguna intención de actuar según ellos?',
    hintEn: 'As opposed to “I have the thoughts but I definitely will not do anything about them.”',
    hintEs: 'A diferencia de “tengo los pensamientos pero definitivamente no haré nada al respecto.”',
  },
  {
    id: 'q5',
    band: 'high',
    timeframe: 'month',
    branch: true,
    en: 'Have you started to work out or worked out the details of how to kill yourself? Do you intend to carry out this plan?',
    es: '¿Ha empezado a elaborar o ha elaborado los detalles de cómo suicidarse? ¿Tiene intención de llevar a cabo este plan?',
  },
  {
    id: 'q6',
    band: 'moderate',
    timeframe: 'lifetime',
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

function ynOpt(name, selected, yes, no) {
  const yesChecked = selected === 'yes' ? 'checked' : '';
  const noChecked = selected === 'no' ? 'checked' : '';
  return `
    <div class="likert-row__opts cssrs-row__opts" role="radiogroup" aria-label="${escapeHtml(name)}">
      <label class="likert-opt cssrs-opt" title="${escapeHtml(yes)}" aria-label="${escapeHtml(yes)}">
        <input type="radio" name="${name}" value="yes" ${yesChecked} />
        <span class="cssrs-opt__text">${escapeHtml(yes)}</span>
      </label>
      <label class="likert-opt cssrs-opt" title="${escapeHtml(no)}" aria-label="${escapeHtml(no)}">
        <input type="radio" name="${name}" value="no" ${noChecked} />
        <span class="cssrs-opt__text">${escapeHtml(no)}</span>
      </label>
    </div>`;
}

function rowHtml(q, selected, yes, no) {
  const hint = qHint(q);
  const high = q.band === 'high';
  return `
    <div class="likert-row cssrs-row cssrs-row--${q.band}" data-cssrs-q="${q.id}" ${q.branch ? 'data-cssrs-branch="1"' : ''}>
      <div class="likert-row__q">
        <span class="likert-row__n">${q.id.replace('q', '')}.</span>
        <span class="cssrs-row__prompt">${escapeHtml(qText(q))}</span>
        ${hint ? `<p class="cssrs-row__hint text-muted">${escapeHtml(hint)}</p>` : ''}
      </div>
      ${ynOpt(q.id, selected, yes, no)}
      <div class="cssrs-triage-cell cssrs-triage-cell--${q.band}" aria-hidden="true">
        ${high ? `<span>${escapeHtml(useEnglish() ? 'High Risk' : 'Riesgo alto')}</span>` : ''}
      </div>
    </div>`;
}

function sectionHead(left, right) {
  return `
    <div class="cssrs-section-head" role="presentation">
      <span class="cssrs-section-head__left">${escapeHtml(left)}</span>
      <span class="cssrs-section-head__right">${escapeHtml(right)}</span>
    </div>`;
}

export async function renderCssrs(host, moduleRow) {
  const data = parseJsonSafe(moduleRow.data, {});
  const answers = { ...(data.answers || {}) };
  const band0 = cssrsRiskBand(answers);
  const yes = useEnglish() ? 'Yes' : 'Sí';
  const no = useEnglish() ? 'No' : 'No';
  const pastMonth = useEnglish() ? 'Past Month' : 'Mes pasado';
  const lifetime = useEnglish() ? 'Lifetime' : 'Alguna vez (vida)';
  const past3 = useEnglish() ? 'Past 3 Months' : 'Últimos 3 meses';

  const monthQs = QUESTIONS.filter((q) => q.timeframe === 'month');
  const lifeQs = QUESTIONS.filter((q) => q.timeframe === 'lifetime');

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
        <form id="cssrs-form" class="likert-form cssrs-form">
          <p class="cssrs-instruction text-muted">${escapeHtml(
            t(
              'cssrs.instruction',
              useEnglish()
                ? 'Ask the bolded items. Timeframe: past month (unless noted). If YES to 2, ask 3–5; if NO to 2, skip to 6.'
                : 'Pregunte los ítems en negrita. Marco temporal: mes pasado (salvo indicación). Si 2 = Sí, pregunte 3–5; si 2 = No, pase al 6.',
            ),
          )}</p>

          ${sectionHead(
            useEnglish() ? 'Always ask questions 1 and 2.' : 'Siempre pregunte 1 y 2.',
            pastMonth,
          )}
          <div class="likert-head cssrs-head">
            <div class="likert-head__q">${escapeHtml(useEnglish() ? 'Item' : 'Ítem')}</div>
            <div class="likert-head__opts cssrs-head__opts">
              <span>${escapeHtml(yes)}</span>
              <span>${escapeHtml(no)}</span>
            </div>
            <div class="cssrs-head__triage" aria-hidden="true"></div>
          </div>
          ${monthQs
            .filter((q) => !q.branch)
            .map((q) => rowHtml(q, yn(answers[q.id]), yes, no))
            .join('')}
          <p class="cssrs-branch-note" data-cssrs-branch-note>${escapeHtml(
            useEnglish()
              ? 'If YES to 2, ask questions 3, 4 and 5. If NO to 2, skip to question 6.'
              : 'Si 2 = Sí, pregunte 3, 4 y 5. Si 2 = No, pase a la pregunta 6.',
          )}</p>
          ${monthQs
            .filter((q) => q.branch)
            .map((q) => rowHtml(q, yn(answers[q.id]), yes, no))
            .join('')}

          ${sectionHead(
            useEnglish() ? 'Always ask question 6' : 'Siempre pregunte la 6',
            `${lifetime} · ${past3}`,
          )}
          ${lifeQs.map((q) => rowHtml(q, yn(answers[q.id]), yes, no)).join('')}
          <div class="likert-row cssrs-row cssrs-row--high" data-cssrs-q="q6_recent" id="cssrs-q6-recent">
            <div class="likert-row__q">
              <span class="cssrs-row__prompt">${escapeHtml(
                t(
                  'cssrs.q6recent',
                  useEnglish()
                    ? 'If yes to item 6: was this within the past three months?'
                    : 'Si respondió Sí al ítem 6: ¿fue en los últimos tres meses?',
                ),
              )}</span>
            </div>
            ${ynOpt('q6_recent', yn(answers.q6_recent), yes, no)}
            <div class="cssrs-triage-cell cssrs-triage-cell--high" aria-hidden="true">
              <span>${escapeHtml(useEnglish() ? 'High Risk' : 'Riesgo alto')}</span>
            </div>
          </div>
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

/** Resumen para PDF / contexto. */
export function cssrsSummary(data) {
  const answers = data?.answers || {};
  if (!Object.keys(answers).length) return null;
  const band = cssrsRiskBand(answers);
  return { triage: band.key, label: band.label };
}
