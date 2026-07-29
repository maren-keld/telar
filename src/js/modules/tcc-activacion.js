import { bindAutoSave, collectFormData } from '../autobind.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, parseJsonSafe } from '../utils.js';
import { workspaceAutoSaveStatus } from '../save-status.js';

const ACTIVITIES = [
  'Limpie y ordene su hogar y/o lugar de trabajo: ordene y deshágase de cosas que no utilice o no considere útiles.',
  'Cambie su contexto (mover muebles, estudiar o trabajar en un lugar distinto al habitual).',
  'Mantenga un sueño reparador de 7–8 horas cada noche.',
  'Retome actividades que ha dejado o deseado explorar (bailar, idioma, cocina, instrumento musical, etc.).',
  'Realice ejercicio suave al menos tres veces por semana durante media hora (yoga, bicicleta, meditación, etc.).',
  'Camine o siéntese al aire libre 20–30 minutos todos los días.',
];

const QUIZ = [
  {
    key: 'q0',
    prompt: 'Me levanté en la mañana y siento que no quiero hacer nada. ¿Qué debería hacer?',
    options: [
      { v: 'a', label: 'Relajarme y hacer ejercicios de respiración.' },
      { v: 'b', label: 'Continuar en la cama toda la mañana.' },
      { v: 'c', label: 'Elegir rápidamente alguna de las actividades de activación conductual.', correct: true },
    ],
  },
  {
    key: 'q1',
    prompt: 'Los ejercicios de activación conductual deberían realizarse únicamente durante el proceso de psicoterapia:',
    options: [
      { v: 'a', label: 'Verdadero. Estos ejercicios no deben estar siempre en nuestra rutina.' },
      { v: 'b', label: 'Falso. Es importante mantener al menos 3 de estas actividades en nuestra rutina.', correct: true },
    ],
  },
  {
    key: 'q2',
    prompt:
      'Me siento con mucho ánimo, pero en la noche un poco nostálgico/a. Al día siguiente no me siento tan bien en la mañana, pero al anochecer me siento con mucho ánimo. Estos cambios se deben a:',
    options: [
      { v: 'a', label: 'Indicios de un cuadro depresivo.' },
      { v: 'b', label: 'El estado de ánimo puede variar de manera normal durante el día.', correct: true },
    ],
  },
];

function quizScore(answers) {
  let correct = 0;
  let answered = 0;
  for (const q of QUIZ) {
    const v = answers[q.key];
    if (v == null || v === '') continue;
    answered += 1;
    const opt = q.options.find((o) => o.v === v);
    if (opt?.correct) correct += 1;
  }
  return { correct, answered, total: QUIZ.length };
}

function quizRowHtml(q, selected) {
  return `
    <fieldset class="tcc-quiz__item">
      <legend class="tcc-quiz__prompt">${escapeHtml(q.prompt)}</legend>
      <div class="tcc-quiz__opts" role="radiogroup">
        ${q.options
          .map(
            (o) => `
          <label class="tcc-quiz__opt">
            <input type="radio" name="${q.key}" value="${o.v}" ${selected === o.v ? 'checked' : ''} />
            <span>${escapeHtml(o.label)}</span>
          </label>`,
          )
          .join('')}
      </div>
    </fieldset>`;
}

export async function renderTccActivacion(host, moduleRow) {
  const data = parseJsonSafe(moduleRow.data, {});
  const answers = data.quiz || {};
  const score = quizScore(answers);

  host.innerHTML = `
    <div class="card tcc-module">
      <div class="module-card-head">
        <div>
          <h2 class="module-title" style="margin:0">Activación conductual</h2>
          <p class="module-card-head__sub">Material TCC · casos prácticos con retroalimentación para el profesional</p>
        </div>
        ${
          score.answered > 0
            ? `<div class="badge badge--info module-card-head__badge" title="Aciertos en casos prácticos (solo visible para el profesional)">${score.correct}/${score.total}</div>`
            : ''
        }
      </div>

      <p class="tcc-intro">
        El estado de ánimo refleja la disposición previa a ciertas actividades y puede fluctuar a lo largo del día
        según contexto, actividades y otros factores. El objetivo de estas rutinas es incorporar actividades con
        potencial de mejorar el ánimo: se recomienda al menos <strong>3 actividades por semana</strong>, con o sin
        psicoterapia en curso.
      </p>

      <section class="tcc-activities" aria-labelledby="tcc-act-title">
        <h3 id="tcc-act-title" class="tcc-activities__title">Actividades sugeridas</h3>
        <ul class="tcc-activities__list">
          ${ACTIVITIES.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}
        </ul>
      </section>

      <form id="tcc-act-form">
        <section class="tcc-quiz">
          <h3 class="tcc-quiz__title">Casos prácticos</h3>
          <p class="tcc-section__hint">Marque la única opción correcta en cada caso.</p>
          ${QUIZ.map((q) => quizRowHtml(q, answers[q.key] || '')).join('')}
        </section>

        <div class="form-group tcc-section">
          <label for="tcc-act-weekly">Actividades que incorporaré esta semana (opcional)</label>
          <textarea id="tcc-act-weekly" name="weekly_plan" rows="4" placeholder="Ej. caminar 20 min diarios, retomar cocina los miércoles…">${escapeHtml(data.weekly_plan || '')}</textarea>
        </div>
      </form>
    </div>`;

  const form = host.querySelector('#tcc-act-form');

  const persist = async () => {
    const fd = collectFormData(form);
    const payload = Object.fromEntries(fd.entries());
    const quiz = {};
    for (const q of QUIZ) {
      if (payload[q.key] != null) quiz[q.key] = payload[q.key];
    }
    payload.quiz = quiz;
    for (const q of QUIZ) delete payload[q.key];
    await syncModuleReadableText(moduleRow, payload, 'completado');
    const s = quizScore(quiz);
    const badge = host.querySelector('.module-card-head__badge');
    if (s.answered > 0) {
      const label = `${s.correct}/${s.total}`;
      if (badge) badge.textContent = label;
      else {
        const head = host.querySelector('.module-card-head');
        head?.insertAdjacentHTML(
          'beforeend',
          `<div class="badge badge--info module-card-head__badge" title="Aciertos en casos prácticos (solo visible para el profesional)">${label}</div>`,
        );
      }
    }
  };

  bindAutoSave(form, persist, workspaceAutoSaveStatus());
}
