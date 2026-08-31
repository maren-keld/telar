/**
 * Caso de ejemplo precargado al primer arranque (PIN nuevo).
 * Paciente ficticio con 8 sesiones y escalas longitudinales ya completadas.
 */
import { buildReadableText } from './readable-text.js';
import { getModuleDef } from './config.js';
import {
  createTreatment,
  execute,
  getSessionsWithModules,
  query,
  saveModuleData,
  upsertPatient,
} from './db.js';
import { loadProfile, saveProfile } from './profile.js';
import { getTreatmentTemplate } from './treatment-templates.js';

export const DEMO_PATIENT_SOURCE = '__telar_demo__';
export const DEMO_FOCUS_SCORES_KEY = 'telar.demo.focusScores';

/** Reparte un total en `count` ítems Likert 0..max (para tests y seed). */
export function likertAnswers(total, count, max = 3) {
  const answers = Array(count).fill(0);
  let remaining = Math.max(0, total);
  for (let i = 0; i < count; i++) {
    const slotsLeft = count - i;
    const v = Math.min(max, Math.max(0, Math.ceil(remaining / slotsLeft)));
    answers[i] = v;
    remaining -= v;
  }
  return answers;
}

const GAD7_BY_SESSION = { 1: 13, 8: 5 };
const ASRS_BY_SESSION = {
  1: [3, 3, 2, 3, 3, 2, 2, 2, 2, 1, 2, 2, 1, 1, 1, 1, 1, 1],
  7: [2, 2, 2, 2, 2, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
  8: [2, 2, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0],
};
const MOOD_BY_SESSION = { 4: 42, 7: 58, 8: 68 };
const ANXIETY_BY_SESSION = { 3: 72, 6: 48 };
const ROSENBERG_SESSION_6 = [1, 1, 4, 1, 4, 1, 1, 4, 4, 3];
const DASS21_SESSION_2 = [
  2, 2, 1, 2, 1, 2, 2, 2, 1, 2, 2, 1, 2, 2, 1, 1, 2, 2, 2, 1, 1,
];
const QOLS_SESSION_8 = [4, 5, 4, 5, 4, 4, 5, 4, 5, 4, 5, 4, 4, 5, 4, 5];

async function demoPatientExists() {
  const rows = await query(`SELECT id FROM patients WHERE source = ? LIMIT 1`, [DEMO_PATIENT_SOURCE]);
  return rows.length > 0;
}

async function fillModule(moduleRow, payload) {
  const readable = buildReadableText(moduleRow.module_type, payload);
  const label = getModuleDef(moduleRow.module_type)?.label || moduleRow.module_type;
  const merged = {
    ...payload,
    readable_text: readable ? `# ${label}\n${readable}` : `# ${label}\n`,
  };
  await saveModuleData(moduleRow.id, merged, 'completado');
}

function moduleInSession(sessions, sessionNumber, moduleType) {
  const session = sessions.find((s) => s.number === sessionNumber);
  return session?.modules.find((m) => m.module_type === moduleType) || null;
}

async function fillPsychometricModules(sessions) {
  for (const [num, total] of Object.entries(GAD7_BY_SESSION)) {
    const mod = moduleInSession(sessions, Number(num), 'gad7');
    if (mod) await fillModule(mod, { answers: likertAnswers(total, 7, 3) });
  }

  for (const [num, answers] of Object.entries(ASRS_BY_SESSION)) {
    const mod = moduleInSession(sessions, Number(num), 'asrs');
    if (mod) await fillModule(mod, { answers });
  }

  for (const [num, score] of Object.entries(MOOD_BY_SESSION)) {
    const mod = moduleInSession(sessions, Number(num), 'escala_animo');
    if (mod) await fillModule(mod, { mood_score: score });
  }

  for (const [num, score] of Object.entries(ANXIETY_BY_SESSION)) {
    const mod = moduleInSession(sessions, Number(num), 'escala_ansiedad');
    if (mod) await fillModule(mod, { anxiety_score: score });
  }

  const dass = moduleInSession(sessions, 2, 'dass21');
  if (dass) await fillModule(dass, { answers: DASS21_SESSION_2 });

  const rsb = moduleInSession(sessions, 6, 'rosenberg');
  if (rsb) await fillModule(rsb, { answers: ROSENBERG_SESSION_6 });

  const qols = moduleInSession(sessions, 8, 'qols');
  if (qols) await fillModule(qols, { answers: QOLS_SESSION_8 });
}

async function fillConceptualizationModules(sessions) {
  const registro = moduleInSession(sessions, 1, 'registro_inicial');
  if (registro) {
    await fillModule(registro, {
      nombre: 'Camila R. (ejemplo)',
      genero: 'femenino',
      id_number: '12.345.678-9',
      birth_date: '1992-03-15',
      email: 'camila.ejemplo@email.cl',
      phone: '+56 9 1234 5678',
      address: 'Providencia, Santiago',
      marital_status: 'Soltero/a',
      prevision: 'Fonasa',
      source: 'Derivación médica (ejemplo)',
      ocupaciones: 'Diseñadora UX',
    });
  }

  const motivo = moduleInSession(sessions, 1, 'motivo_consulta');
  if (motivo) {
    await fillModule(motivo, {
      motivo:
        'Dificultad para organizarme, procrastinar tareas importantes y olvidar compromisos. Consulta por posible TDAH en la adultez.',
      expectativas:
        'Herramientas concretas para el trabajo, menos ansiedad ante plazos y rutinas que pueda sostener.',
      antecedentes:
        'Síntomas atencionales desde la adolescencia, nunca evaluados formalmente. Ansiedad leve en contextos laborales.',
      urgencia: 'Moderada — afecta desempeño laboral.',
    });
  }

  const dx = moduleInSession(sessions, 1, 'diagnostico');
  if (dx) {
    await fillModule(dx, {
      structured: {
        comorbidities: 'Ansiedad generalizada leve (tamizaje GAD-7).',
        trauma_events: 'Sin eventos traumáticos relevantes reportados.',
        medication: 'Ninguna.',
        dx_notes:
          'Caso ficticio de demostración Telar. Perfil compatible con TDAH en adultez + ansiedad situacional.',
      },
      problems: [
        { text: 'Déficit atencional y organización', assigned: true, checked: true },
        { text: 'Procrastinación crónica', assigned: true, checked: true },
        { text: 'Ansiedad anticipatoria', assigned: true, checked: false },
      ],
    });
  }
}

/** Marca sesiones 1–7 como realizadas; la 8 queda programada (próxima cita). */
async function markSessionStatuses(sessions) {
  for (const s of sessions) {
    const status = s.number <= 7 ? 'realizada' : 'programada';
    await execute(`UPDATE sessions SET status = ? WHERE id = ?`, [status, s.id]);
  }
}

/**
 * Inserta el caso demo si corresponde.
 * @returns {Promise<number|null>} treatmentId si se creó, null si no.
 */
export async function seedDemoCaseIfNeeded({ firstSetup = false } = {}) {
  if (await demoPatientExists()) {
    if (!loadProfile().demoCaseSeeded) saveProfile({ demoCaseSeeded: true });
    return null;
  }

  if (!firstSetup) {
    const [{ n }] = await query(`SELECT COUNT(*) AS n FROM patients`);
    if (Number(n) > 0) return null;
    if (loadProfile().demoCaseSeeded) return null;
  }

  const template = getTreatmentTemplate('tdah_8');
  if (!template) {
    console.warn('[demo-seed] Plantilla tdah_8 no disponible (packs sin cargar).');
    return null;
  }

  const patientId = await upsertPatient({
    name: 'Camila R. (ejemplo)',
    id_number: '12.345.678-9',
    email: 'camila.ejemplo@email.cl',
    phone: '+56912345678',
    address: 'Providencia, Santiago',
    gender: 'femenino',
    birth_date: '1992-03-15',
    marital_status: 'Soltero/a',
    source: DEMO_PATIENT_SOURCE,
    occupations: ['Diseñadora UX'],
  });

  const treatmentId = await createTreatment(patientId, { templateId: 'tdah_8' });
  const sessions = await getSessionsWithModules(treatmentId);

  await fillConceptualizationModules(sessions);
  await fillPsychometricModules(sessions);
  await markSessionStatuses(sessions);

  saveProfile({ demoCaseSeeded: true });
  try {
    localStorage.setItem(DEMO_FOCUS_SCORES_KEY, String(treatmentId));
  } catch {
    /* ignore */
  }

  return treatmentId;
}
