import { getTreatmentTemplate } from './treatment-templates.js';
import { isCustomModuleType, resolveModuleDef } from './custom-modules.js';
import { clinicalAlertFromModules, VITAL_RISK_LABELS } from './clinical-alert.js';
import { parseJsonSafe } from './utils.js';
import { getInvoke, isTauriApp, loadSqlDatabase } from './tauri-bridge.js';

let dbInstance = null;

async function loadDatabase() {
  if (dbInstance) return dbInstance;
  if (!isTauriApp()) {
    throw new Error(
      'Abre Telar con la app de escritorio (dist/Telar.app), no con el navegador ni abriendo index.html directo.',
    );
  }
  dbInstance = await loadSqlDatabase('sqlite:telar.db');
  return dbInstance;
}

export async function query(sql, params = []) {
  const db = await loadDatabase();
  return db.select(sql, params);
}

export async function execute(sql, params = []) {
  const db = await loadDatabase();
  return db.execute(sql, params);
}

async function loadClinicalAlertIds() {
  const placeholders = VITAL_RISK_LABELS.map(() => '?').join(', ');
  const spaceRows = await query(
    `SELECT treatment_id, label FROM treatment_space_checks
     WHERE checked = 1 AND label IN (${placeholders})`,
    VITAL_RISK_LABELS,
  );
  const spaceByTreatment = new Map();
  for (const row of spaceRows) {
    const id = Number(row.treatment_id);
    if (!spaceByTreatment.has(id)) spaceByTreatment.set(id, []);
    spaceByTreatment.get(id).push(row.label);
  }
  const mods = await query(
    `SELECT s.treatment_id, sm.module_type, sm.data
     FROM session_modules sm
     JOIN sessions s ON s.id = sm.session_id
     WHERE sm.module_type IN ('motivo_consulta', 'sprint_ecl', 'escala_fer')
       AND sm.data IS NOT NULL AND sm.data != '' AND sm.data != '{}'`,
  );
  const modsByTreatment = new Map();
  for (const row of mods) {
    const id = Number(row.treatment_id);
    if (!modsByTreatment.has(id)) modsByTreatment.set(id, []);
    modsByTreatment.get(id).push(row);
  }
  const ids = new Set();
  const allIds = new Set([...spaceByTreatment.keys(), ...modsByTreatment.keys()]);
  for (const id of allIds) {
    if (clinicalAlertFromModules(modsByTreatment.get(id) || [], spaceByTreatment.get(id) || [])) {
      ids.add(id);
    }
  }
  return ids;
}

export async function getAgendaGroups(search = '') {
  const like = `%${search.trim()}%`;
  const [rows, alertIds] = await Promise.all([
    query(
      `SELECT t.id AS treatment_id, t.number AS treatment_number, t.status,
              t.requires_referral, t.supervised, t.tags, t.created_at, t.convenio_id,
              p.id AS patient_id, p.name,
              c.name AS convenio_name
       FROM treatments t
       JOIN patients p ON p.id = t.patient_id
       LEFT JOIN convenios c ON c.id = t.convenio_id
       WHERE (? = '' OR p.name LIKE ? OR CAST(p.id_number AS TEXT) LIKE ? OR CAST(p.phone AS TEXT) LIKE ?)
       ORDER BY t.status, t.created_at DESC, p.name`,
      [search.trim(), like, like, like],
    ),
    loadClinicalAlertIds(),
  ]);
  const groups = {};
  for (const row of rows) {
    row.tags = parseJsonSafe(row.tags, []);
    row.clinical_alert = alertIds.has(Number(row.treatment_id));
    if (!groups[row.status]) groups[row.status] = [];
    groups[row.status].push(row);
  }
  return groups;
}

export async function getTreatment(treatmentId) {
  const [row] = await query(
    `SELECT t.*, p.name AS patient_name, p.id AS patient_id,
            c.name AS convenio_name
     FROM treatments t
     JOIN patients p ON p.id = t.patient_id
     LEFT JOIN convenios c ON c.id = t.convenio_id
     WHERE t.id = ?`,
    [treatmentId],
  );
  return row;
}

export async function getSessions(treatmentId) {
  return query(
    `SELECT * FROM sessions WHERE treatment_id = ? ORDER BY number`,
    [treatmentId],
  );
}

export async function getSessionModules(sessionId) {
  return query(
    `SELECT * FROM session_modules WHERE session_id = ? ORDER BY sort_order`,
    [sessionId],
  );
}

/** Todos los módulos del tratamiento en una sola consulta. */
export async function getTreatmentModules(treatmentId) {
  return query(
    `SELECT sm.* FROM session_modules sm
     JOIN sessions s ON s.id = sm.session_id
     WHERE s.treatment_id = ?
     ORDER BY s.number, sm.sort_order`,
    [treatmentId],
  );
}

export async function getModule(moduleId) {
  const [row] = await query(`SELECT * FROM session_modules WHERE id = ?`, [moduleId]);
  return row;
}

const MODULE_TYPES_NO_MOVE = new Set(['registro_inicial', 'motivo_consulta', 'selector_modulo']);

/** Registro inicial y motivo de consulta no se pueden reordenar ni mover de sesión. */
export function canMoveModule(module) {
  return module && !MODULE_TYPES_NO_MOVE.has(module.module_type);
}

/** Registro inicial y motivo de consulta son parte de la estructura del caso. */
const MODULE_TYPES_NO_DELETE = new Set(['registro_inicial', 'motivo_consulta']);

/** No se puede borrar lo estructural ni dejar una sesión sin módulos. */
export function canDeleteModule(module, sessionModules) {
  if (!module || MODULE_TYPES_NO_DELETE.has(module.module_type)) return false;
  const others = (sessionModules || []).filter((m) => String(m.id) !== String(module.id));
  return others.length > 0;
}

export async function moveModuleToPosition(moduleId, targetSessionId, insertIndex) {
  const mod = await getModule(moduleId);
  if (!mod) throw new Error('Módulo no encontrado');
  if (!canMoveModule(mod)) throw new Error('Este módulo no se puede mover.');

  const sourceSessionId = mod.session_id;
  let sourceMods = (await getSessionModules(sourceSessionId)).filter(
    (m) => String(m.id) !== String(moduleId),
  );
  const changesSession = String(sourceSessionId) !== String(targetSessionId);
  if (changesSession && !sourceMods.length) {
    throw new Error('Una sesión no puede quedar sin módulos.');
  }
  let targetMods = changesSession
    ? await getSessionModules(targetSessionId)
    : [...sourceMods];

  insertIndex = Math.max(0, Math.min(insertIndex, targetMods.length));
  targetMods.splice(insertIndex, 0, mod);

  if (sourceSessionId !== targetSessionId) {
    for (let i = 0; i < sourceMods.length; i++) {
      await execute(`UPDATE session_modules SET sort_order = ? WHERE id = ?`, [i, sourceMods[i].id]);
    }
  }

  for (let i = 0; i < targetMods.length; i++) {
    await execute(
      `UPDATE session_modules SET session_id = ?, sort_order = ? WHERE id = ?`,
      [targetSessionId, i, targetMods[i].id],
    );
  }
}

export async function deleteSessionModule(moduleId) {
  const mod = await getModule(moduleId);
  if (!mod) throw new Error('Módulo no encontrado');
  const sessionMods = await getSessionModules(mod.session_id);
  if (!canDeleteModule(mod, sessionMods)) {
    throw new Error('Este módulo no se puede eliminar.');
  }
  await execute(`DELETE FROM session_modules WHERE id = ?`, [moduleId]);
}

/** Reemplaza un módulo clínico por el selector. Si es el único de la sesión, lo convierte in situ. */
export async function swapModuleToSelector(moduleId) {
  const mod = await getModule(moduleId);
  if (!mod) throw new Error('Módulo no encontrado');
  if (MODULE_TYPES_NO_DELETE.has(mod.module_type) || mod.module_type === 'selector_modulo') {
    throw new Error('Este módulo no se puede cambiar.');
  }
  const sessionMods = await getSessionModules(mod.session_id);
  const others = sessionMods.filter((m) => String(m.id) !== String(moduleId));
  const existingSel = others.find((m) => m.module_type === 'selector_modulo');

  if (!others.length) {
    await execute(
      `UPDATE session_modules SET module_type = 'selector_modulo', data = '{}', status = 'pendiente', updated_at = datetime('now') WHERE id = ?`,
      [moduleId],
    );
    return { sessionId: mod.session_id, moduleId: Number(moduleId) };
  }

  await deleteSessionModule(moduleId);
  if (existingSel) {
    return { sessionId: mod.session_id, moduleId: existingSel.id };
  }
  const id = await addModuleToSession(mod.session_id, 'selector_modulo');
  return { sessionId: mod.session_id, moduleId: id };
}

export async function saveModuleData(moduleId, data, status = 'completado') {
  await execute(
    `UPDATE session_modules SET data = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
    [JSON.stringify(data), status, moduleId],
  );
}

export async function listPatients() {
  return query(`SELECT id, name FROM patients ORDER BY name COLLATE NOCASE ASC`);
}

/** Crea paciente (si hace falta), tratamiento nuevo y agenda la primera sesión. */
export async function createAgendaAppointment({ patientId = null, patientName = '', scheduledAt, durationMin = 50 }) {
  let pid = patientId ? Number(patientId) : null;
  if (!pid) {
    const name = (patientName || '').trim() || 'Paciente sin nombre';
    pid = await upsertPatient({ name });
  }
  const treatmentId = await createTreatment(pid);
  const sessions = await getSessions(treatmentId);
  const sessionId = sessions[0]?.id;
  if (!sessionId) throw new Error('No se pudo crear la sesión');
  await scheduleSession(sessionId, { scheduledAt, durationMin });
  return { treatmentId, sessionId, patientId: pid };
}

export async function upsertPatient(patient) {
  if (patient.id) {
    await execute(
      `UPDATE patients SET name=?, id_number=?, email=?, phone=?, address=?,
       gender=?, birth_date=?, marital_status=?, source=?, occupations=?,
       updated_at=datetime('now') WHERE id=?`,
      [
        patient.name,
        patient.id_number,
        patient.email,
        patient.phone,
        patient.address,
        patient.gender,
        patient.birth_date,
        patient.marital_status,
        patient.source,
        JSON.stringify(patient.occupations || []),
        patient.id,
      ],
    );
    return patient.id;
  }
  const result = await execute(
    `INSERT INTO patients (name, id_number, email, phone, address, gender, birth_date, marital_status, source, occupations)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      patient.name,
      patient.id_number,
      patient.email,
      patient.phone,
      patient.address,
      patient.gender || 'femenino',
      patient.birth_date,
      patient.marital_status,
      patient.source,
      JSON.stringify(patient.occupations || []),
    ],
  );
  return result.lastInsertId;
}

export async function getTreatmentModuleTypes(treatmentId) {
  const rows = await query(
    `SELECT DISTINCT sm.module_type AS module_type FROM session_modules sm
     JOIN sessions s ON s.id = sm.session_id
     WHERE s.treatment_id = ?`,
    [treatmentId],
  );
  return rows.map((r) => r.module_type);
}

export async function findModuleInTreatment(treatmentId, moduleType) {
  const rows = await query(
    `SELECT sm.id AS module_id, s.id AS session_id FROM session_modules sm
     JOIN sessions s ON s.id = sm.session_id
     WHERE s.treatment_id = ? AND sm.module_type = ?
     LIMIT 1`,
    [treatmentId, moduleType],
  );
  return rows[0] || null;
}

export async function treatmentHasModuleType(treatmentId, moduleType) {
  const rows = await query(
    `SELECT 1 FROM session_modules sm
     JOIN sessions s ON s.id = sm.session_id
     WHERE s.treatment_id = ? AND sm.module_type = ?
     LIMIT 1`,
    [treatmentId, moduleType],
  );
  return rows.length > 0;
}

export async function getSessionsWithModules(treatmentId) {
  const sessions = await getSessions(treatmentId);
  const out = [];
  for (const s of sessions) {
    out.push({ ...s, modules: await getSessionModules(s.id) });
  }
  return out;
}

export async function bootstrapDefaultTreatment(treatmentId) {
  let sessions = await getSessions(treatmentId);
  let sessionId;
  if (!sessions.length) {
    sessionId = await addSession(treatmentId, { addSelector: false });
  } else {
    sessionId = sessions[0].id;
  }
  if (!(await treatmentHasModuleType(treatmentId, 'registro_inicial'))) {
    await addModuleToSession(sessionId, 'registro_inicial', treatmentId);
  }
  if (!(await treatmentHasModuleType(treatmentId, 'motivo_consulta'))) {
    await addModuleToSession(sessionId, 'motivo_consulta', treatmentId);
  }
  const mods = await getSessionModules(sessionId);
  if (!mods.find((m) => m.module_type === 'selector_modulo')) {
    await addModuleToSession(sessionId, 'selector_modulo', treatmentId);
  }
}

export async function resolveWorkspaceEntry(treatmentId) {
  await bootstrapDefaultTreatment(treatmentId);
  const sessions = await getSessionsWithModules(treatmentId);
  const session = sessions[0];
  if (!session) return { sessionId: null, moduleId: null };
  const registro = session.modules.find((m) => m.module_type === 'registro_inicial');
  const mod = registro || session.modules[0];
  return { sessionId: session.id, moduleId: mod?.id ?? null };
}

export async function applyTreatmentTemplate(treatmentId, templateId) {
  const tpl = getTreatmentTemplate(templateId);
  if (!tpl) throw new Error('Plantilla no encontrada');

  let sessionsCreated = 0;
  let modulesAdded = 0;
  let modulesSkipped = 0;

  let sessions = await getSessions(treatmentId);
  for (let i = 0; i < tpl.sessions.length; i++) {
    const spec = tpl.sessions[i];
    let sessionId;
    if (sessions[i]) {
      sessionId = sessions[i].id;
    } else {
      sessionId = await addSession(treatmentId, { addSelector: false });
      sessionsCreated += 1;
      sessions = await getSessions(treatmentId);
    }
    for (const modType of spec.modules) {
      if (modType === 'selector_modulo') continue;
      try {
        await addModuleToSession(sessionId, modType, treatmentId);
        modulesAdded += 1;
      } catch {
        /* duplicado en sesión o once-per-treatment — no se toca el contenido */
        modulesSkipped += 1;
      }
    }
    const mods = await getSessionModules(sessionId);
    if (!mods.some((m) => m.module_type === 'selector_modulo')) {
      try {
        await addModuleToSession(sessionId, 'selector_modulo', treatmentId);
      } catch {
        /* ya existe */
      }
    }
  }

  return {
    templateId,
    label: tpl.label,
    sessionCount: tpl.sessions.length,
    sessionsCreated,
    modulesAdded,
    modulesSkipped,
  };
}

export async function createTreatment(patientId, { templateId = null } = {}) {
  const [{ maxn }] = await query(
    `SELECT COALESCE(MAX(number), 0) + 1 AS maxn FROM treatments WHERE patient_id = ?`,
    [patientId],
  );
  const result = await execute(
    `INSERT INTO treatments (patient_id, number, status, tags) VALUES (?, ?, 'en_tratamiento', '[]')`,
    [patientId, maxn],
  );
  const treatmentId = result.lastInsertId;
  await bootstrapDefaultTreatment(treatmentId);
  if (templateId) await applyTreatmentTemplate(treatmentId, templateId);
  return treatmentId;
}

/** Copia data/readable_text/status de módulos homólogos entre tratamientos del mismo paciente. */
export async function copyModuleDataBetweenTreatments(sourceTreatmentId, destTreatmentId, moduleTypes) {
  const srcSessions = await getSessionsWithModules(sourceTreatmentId);
  const dstSessions = await getSessionsWithModules(destTreatmentId);
  const srcMods = srcSessions.flatMap((s) => s.modules);
  const dstMods = dstSessions.flatMap((s) => s.modules);

  for (const type of moduleTypes) {
    const src = srcMods.find((m) => m.module_type === type);
    const dst = dstMods.find((m) => m.module_type === type);
    if (!src || !dst) continue;
    await execute(
      `UPDATE session_modules SET data = ?, status = ?, readable_text = ?, updated_at = datetime('now') WHERE id = ?`,
      [src.data || '{}', src.status || 'pendiente', src.readable_text || '', dst.id],
    );
  }
}

export async function updateTreatmentStatus(treatmentId, status) {
  await execute(`UPDATE treatments SET status = ? WHERE id = ?`, [status, treatmentId]);
}

export async function updateTreatmentTags(treatmentId, tags) {
  const tagList = [...new Set(tags)];
  const derivado = tagList.includes('derivado') ? 1 : 0;
  const supervised = tagList.includes('necesita_supervision') ? 1 : 0;
  await execute(
    `UPDATE treatments SET tags = ?, requires_referral = ?, supervised = ? WHERE id = ?`,
    [JSON.stringify(tagList), derivado, supervised, treatmentId],
  );
}

export async function updateTreatmentConvenio(treatmentId, convenioId) {
  const id = convenioId ? Number(convenioId) : null;
  await execute(`UPDATE treatments SET convenio_id = ? WHERE id = ?`, [id, treatmentId]);
}

const DEFAULT_PRACTICE_GOALS = {
  convenios: null,
  new_patients_weekly: null,
  new_patients_monthly: null,
  sessions_weekly: null,
  sessions_monthly: null,
};

export async function getPracticeGoals() {
  const [row] = await query(`SELECT goals_json FROM practice_goals WHERE id = 1`);
  return { ...DEFAULT_PRACTICE_GOALS, ...parseJsonSafe(row?.goals_json, {}) };
}

export async function savePracticeGoals(goals) {
  const merged = { ...DEFAULT_PRACTICE_GOALS, ...goals };
  await execute(
    `UPDATE practice_goals SET goals_json = ?, updated_at = datetime('now') WHERE id = 1`,
    [JSON.stringify(merged)],
  );
  return merged;
}

export async function getGoalsProgress() {
  const [{ convenios }] = await query(`SELECT COUNT(*) AS convenios FROM convenios`);
  const [{ new_week }] = await query(
    `SELECT COUNT(*) AS new_week FROM patients
     WHERE date(created_at) >= date('now', '-6 days')`,
  );
  const [{ new_month }] = await query(
    `SELECT COUNT(*) AS new_month FROM patients
     WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`,
  );
  const [{ sess_week }] = await query(
    `SELECT COUNT(*) AS sess_week FROM sessions
     WHERE status = 'completada' AND date(created_at) >= date('now', '-6 days')`,
  );
  const [{ sess_month }] = await query(
    `SELECT COUNT(*) AS sess_month FROM sessions
     WHERE status = 'completada'
       AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')`,
  );
  return {
    convenios: Number(convenios || 0),
    new_patients_weekly: Number(new_week || 0),
    new_patients_monthly: Number(new_month || 0),
    sessions_weekly: Number(sess_week || 0),
    sessions_monthly: Number(sess_month || 0),
  };
}

export async function listConvenios() {
  const rows = await query(`SELECT * FROM convenios ORDER BY name COLLATE NOCASE`);
  return rows.map((r) => ({
    ...r,
    contacts: parseJsonSafe(r.contacts, []),
  }));
}

export async function getConvenio(convenioId) {
  const [row] = await query(`SELECT * FROM convenios WHERE id = ?`, [convenioId]);
  if (!row) return null;
  return { ...row, contacts: parseJsonSafe(row.contacts, []) };
}

export async function upsertConvenio(convenio) {
  const contacts = JSON.stringify(convenio.contacts || []);
  if (convenio.id) {
    await execute(
      `UPDATE convenios SET name = ?, org_type = ?, notes = ?, contacts = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [convenio.name, convenio.org_type || '', convenio.notes || '', contacts, convenio.id],
    );
    return convenio.id;
  }
  const result = await execute(
    `INSERT INTO convenios (name, org_type, notes, contacts) VALUES (?, ?, ?, ?)`,
    [convenio.name, convenio.org_type || '', convenio.notes || '', contacts],
  );
  return result.lastInsertId;
}

export async function deleteConvenio(convenioId) {
  await execute(`UPDATE treatments SET convenio_id = NULL WHERE convenio_id = ?`, [convenioId]);
  await execute(`DELETE FROM convenios WHERE id = ?`, [convenioId]);
}

export async function getTreatmentTags(treatmentId) {
  const t = await getTreatment(treatmentId);
  return parseJsonSafe(t?.tags, []);
}

export async function addSession(treatmentId, { addSelector = true } = {}) {
  const [{ maxn }] = await query(
    `SELECT COALESCE(MAX(number), 0) + 1 AS maxn FROM sessions WHERE treatment_id = ?`,
    [treatmentId],
  );
  const result = await execute(
    `INSERT INTO sessions (treatment_id, number, status) VALUES (?, ?, 'programada')`,
    [treatmentId, maxn],
  );
  const sessionId = result.lastInsertId;
  if (addSelector) await addModuleToSession(sessionId, 'selector_modulo', treatmentId);
  return sessionId;
}

export async function addModuleToSession(sessionId, moduleType, treatmentId = null) {
  const def = resolveModuleDef(moduleType);
  if (!def && !isCustomModuleType(moduleType)) {
    throw new Error('Tipo de módulo no válido.');
  }
  // Evitar duplicados en la misma sesión (salvo que el módulo lo permita)
  if (!def?.allowMultipleInSession) {
    const existing = await query(
      `SELECT 1 FROM session_modules WHERE session_id = ? AND module_type = ? LIMIT 1`,
      [sessionId, moduleType],
    );
    if (existing.length) {
      throw new Error(`Este módulo ya está en esta sesión: «${def?.label || moduleType}».`);
    }
  }
  if (def?.oncePerTreatment) {
    let tid = treatmentId;
    if (!tid) {
      const [s] = await query(`SELECT treatment_id FROM sessions WHERE id = ?`, [sessionId]);
      tid = s?.treatment_id;
    }
    if (tid && (await treatmentHasModuleType(tid, moduleType))) {
      throw new Error(`Este tratamiento ya tiene «${def.label}».`);
    }
  }
  const [{ maxo }] = await query(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS maxo FROM session_modules WHERE session_id = ?`,
    [sessionId],
  );
  const result = await execute(
    `INSERT INTO session_modules (session_id, module_type, sort_order, status, data)
     VALUES (?, ?, ?, 'pendiente', '{}')`,
    [sessionId, moduleType, maxo],
  );
  return result.lastInsertId;
}

/** Convierte el placeholder «selector_modulo» en un módulo clínico real. */
export async function replaceSelectorWithModule(selectorModuleId, moduleType, treatmentId) {
  const mod = await getModule(selectorModuleId);
  if (!mod) throw new Error('Módulo no encontrado');
  if (mod.module_type !== 'selector_modulo') {
    throw new Error('Solo el selector de módulo puede reemplazarse así.');
  }
  const def = resolveModuleDef(moduleType);
  if (!def || moduleType === 'selector_modulo') {
    throw new Error('Tipo de módulo no válido.');
  }
  if (!def.allowMultipleInSession) {
    const existing = await query(
      `SELECT 1 FROM session_modules WHERE session_id = ? AND module_type = ? AND id != ? LIMIT 1`,
      [mod.session_id, moduleType, selectorModuleId],
    );
    if (existing.length) {
      throw new Error(`Este módulo ya está en esta sesión: «${def.label}».`);
    }
  }
  if (def.oncePerTreatment && treatmentId) {
    const rows = await query(
      `SELECT 1 FROM session_modules sm
       JOIN sessions s ON s.id = sm.session_id
       WHERE s.treatment_id = ? AND sm.module_type = ? AND sm.id != ?
       LIMIT 1`,
      [treatmentId, moduleType, selectorModuleId],
    );
    if (rows.length) {
      throw new Error(`Este tratamiento ya tiene «${def.label}».`);
    }
  }
  await execute(
    `UPDATE session_modules SET module_type = ?, data = '{}', status = 'pendiente', updated_at = datetime('now') WHERE id = ?`,
    [moduleType, selectorModuleId],
  );
  return selectorModuleId;
}

export async function getPatientDemographicsStats() {
  const patients = await query(
    `SELECT gender, birth_date, marital_status, source, address FROM patients`,
  );
  const registroRows = await query(
    `SELECT data FROM session_modules WHERE module_type = 'registro_inicial' AND data IS NOT NULL AND data != '{}'`,
  );

  const ageBuckets = {
    '0–17': 0,
    '18–29': 0,
    '30–44': 0,
    '45–59': 0,
    '60+': 0,
    'Sin dato': 0,
  };
  const gender = { Femenino: 0, Masculino: 0, 'Sin dato': 0 };
  const marital = {};
  const source = {};
  const prevision = {};
  const addresses = [];

  const bump = (obj, key) => {
    const k = key && String(key).trim() ? String(key).trim() : 'Sin dato';
    obj[k] = (obj[k] || 0) + 1;
  };

  const ageFromBirth = (birth) => {
    if (!birth) return null;
    const d = new Date(birth);
    if (Number.isNaN(d.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - d.getFullYear();
    const m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
    return age;
  };

  for (const p of patients) {
    const age = ageFromBirth(p.birth_date);
    if (age === null) ageBuckets['Sin dato'] += 1;
    else if (age < 18) ageBuckets['0–17'] += 1;
    else if (age < 30) ageBuckets['18–29'] += 1;
    else if (age < 45) ageBuckets['30–44'] += 1;
    else if (age < 60) ageBuckets['45–59'] += 1;
    else ageBuckets['60+'] += 1;

    if (p.gender === 'masculino') gender.Masculino += 1;
    else if (p.gender === 'femenino') gender.Femenino += 1;
    else gender['Sin dato'] += 1;

    bump(marital, p.marital_status);
    bump(source, p.source);
    if (p.address) addresses.push(p.address);
  }

  for (const row of registroRows) {
    const data = parseJsonSafe(row.data, {});
    if (data.prevision) bump(prevision, data.prevision);
    if (data.address && !addresses.includes(data.address)) addresses.push(data.address);
  }

  const toSlices = (obj) =>
    Object.entries(obj)
      .filter(([, v]) => v > 0)
      .map(([label, count]) => ({ label, count }));

  return {
    age_ranges: toSlices(ageBuckets),
    gender: toSlices(gender),
    marital_status: toSlices(marital),
    source: toSlices(source),
    prevision: toSlices(prevision),
    addresses,
  };
}

export async function getDashboardStats() {
  const [{ total_patients }] = await query(`SELECT COUNT(*) AS total_patients FROM patients`);
  const [{ total_treatments }] = await query(`SELECT COUNT(*) AS total_treatments FROM treatments`);

  const months = await query(
    `WITH RECURSIVE months(m) AS (
        SELECT strftime('%Y-%m', 'now', '-11 months')
        UNION ALL
        SELECT strftime('%Y-%m', date(m || '-01', '+1 month')) FROM months WHERE m < strftime('%Y-%m', 'now')
      )
      SELECT months.m AS ym,
             COALESCE(COUNT(p.id), 0) AS new_patients
      FROM months
      LEFT JOIN patients p ON strftime('%Y-%m', p.created_at) = months.m
      GROUP BY months.m
      ORDER BY months.m`,
  );

  return {
    total_patients: Number(total_patients || 0),
    total_treatments: Number(total_treatments || 0),
    new_patients_by_month: months.map((r) => ({ ym: r.ym, count: Number(r.new_patients || 0) })),
  };
}

export async function getClinicalNotes(treatmentId, { kind } = {}) {
  const rows = await query(
    `SELECT * FROM clinical_notes WHERE treatment_id = ? ORDER BY created_at DESC`,
    [treatmentId],
  );
  if (!kind) return rows;
  return rows.filter((r) => (r.kind || 'comment') === kind);
}

export async function addClinicalNote(treatmentId, colorOrOpts = 'teal', legacyContent = '') {
  let opts;
  if (typeof colorOrOpts === 'object' && colorOrOpts !== null) {
    opts = colorOrOpts;
  } else {
    opts = { color: colorOrOpts, content: legacyContent, kind: 'comment' };
  }
  const {
    color = 'teal',
    content = '',
    kind = 'comment',
    quoteText = '',
    sourceLabel = '',
    sessionId = null,
    moduleId = null,
    authorInitials = '',
  } = opts;
  const result = await execute(
    `INSERT INTO clinical_notes
     (treatment_id, note_type, color, content, kind, quote_text, source_label, session_id, module_id, author_initials)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      treatmentId,
      color,
      color,
      content,
      kind,
      quoteText,
      sourceLabel,
      sessionId,
      moduleId,
      authorInitials,
    ],
  );
  return result.lastInsertId;
}

export async function updateClinicalNote(noteId, fields) {
  const content = fields.content ?? '';
  const color = fields.color ?? 'teal';
  const starred = fields.starred ? 1 : 0;
  const quoteText = fields.quoteText ?? '';
  const sourceLabel = fields.sourceLabel ?? '';
  await execute(
    `UPDATE clinical_notes SET content = ?, color = ?, note_type = ?, starred = ?,
     quote_text = ?, source_label = ? WHERE id = ?`,
    [content, color, color, starred, quoteText, sourceLabel, noteId],
  );
}

export async function deleteClinicalNote(noteId) {
  await execute(`DELETE FROM clinical_notes WHERE id = ?`, [noteId]);
}

export async function saveNeurofeedbackRecording(moduleId, payload) {
  await execute(
    `INSERT INTO neurofeedback_recordings
     (session_module_id, device, locations, protocol, started_at, ended_at, duration_sec, raw_data, results_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      moduleId,
      payload.device,
      JSON.stringify(payload.locations || []),
      payload.protocol,
      payload.started_at,
      payload.ended_at,
      payload.duration_sec,
      payload.raw_data,
      JSON.stringify(payload.results || {}),
    ],
  );
}

export async function getTreatmentReport(treatmentId) {
  return query(
    `SELECT nr.*, sm.module_type, s.number AS session_number
     FROM neurofeedback_recordings nr
     JOIN session_modules sm ON sm.id = nr.session_module_id
     JOIN sessions s ON s.id = sm.session_id
     WHERE s.treatment_id = ?
     ORDER BY nr.created_at DESC`,
    [treatmentId],
  );
}

export async function analyzeSessionPython(rawData) {
  const invoke = getInvoke();
  return invoke('analyze_neurofeedback_session', { textData: rawData });
}

export async function getSpaceChecks(treatmentId, category) {
  return query(
    `SELECT * FROM treatment_space_checks WHERE treatment_id = ? AND category = ? ORDER BY label`,
    [treatmentId, category],
  );
}

export async function setSpaceCheck(treatmentId, category, label, checked) {
  await execute(
    `INSERT INTO treatment_space_checks (treatment_id, category, label, checked, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(treatment_id, category, label) DO UPDATE SET checked = excluded.checked, updated_at = datetime('now')`,
    [treatmentId, category, label, checked ? 1 : 0],
  );
}

const SESSION_SCHEDULE_JOIN = `
  FROM sessions s
  JOIN treatments t ON t.id = s.treatment_id
  JOIN patients p ON p.id = t.patient_id
`;

function mapScheduledRow(row) {
  return {
    ...row,
    patient_name: row.patient_name,
    treatment_id: row.treatment_id,
    treatment_number: row.treatment_number,
    session_number: row.number,
  };
}

export async function listScheduledSessions({ from, to }) {
  const rows = await query(
    `SELECT s.*, t.id AS treatment_id, t.number AS treatment_number,
            p.name AS patient_name
     ${SESSION_SCHEDULE_JOIN}
     WHERE s.scheduled_at IS NOT NULL
       AND s.scheduled_at >= ?
       AND s.scheduled_at < ?
     ORDER BY s.scheduled_at`,
    [from, to],
  );
  return rows.map(mapScheduledRow);
}

export async function getDaySessions(dateISO) {
  const from = `${dateISO}T00:00`;
  const to = `${dateISO}T23:59`;
  return listScheduledSessions({ from, to });
}

export async function scheduleSession(sessionId, { scheduledAt, durationMin }) {
  await execute(
    `UPDATE sessions SET scheduled_at = ?, duration_min = ? WHERE id = ?`,
    [scheduledAt, durationMin ?? 50, sessionId],
  );
}

export async function unscheduleSession(sessionId) {
  await execute(`UPDATE sessions SET scheduled_at = NULL WHERE id = ?`, [sessionId]);
}

export async function setSessionAttendance(sessionId, attendance) {
  await execute(`UPDATE sessions SET attendance = ? WHERE id = ?`, [attendance, sessionId]);
}

export async function setSessionBilling(sessionId, { feeAmount, paymentStatus, paymentMethod, receiptNumber }) {
  const [existing] = await query(`SELECT paid_at FROM sessions WHERE id = ?`, [sessionId]);
  let paidAt = existing?.paid_at || null;
  if (paymentStatus === 'pagado' && !paidAt) {
    paidAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
  } else if (paymentStatus === 'por_pagar') {
    paidAt = null;
  }
  await execute(
    `UPDATE sessions SET fee_amount = ?, payment_status = ?, payment_method = ?,
     receipt_number = ?, paid_at = ? WHERE id = ?`,
    [feeAmount ?? 0, paymentStatus, paymentMethod ?? '', receiptNumber ?? '', paidAt, sessionId],
  );
}

export async function getBillingRows({ from, to, status }) {
  let sql = `
    SELECT s.id, s.scheduled_at, s.fee_amount, s.payment_status, s.payment_method,
           s.receipt_number, s.paid_at, s.number AS session_number,
           t.id AS treatment_id, t.number AS treatment_number,
           p.name AS patient_name
    ${SESSION_SCHEDULE_JOIN}
    WHERE s.scheduled_at IS NOT NULL
      AND s.scheduled_at >= ?
      AND s.scheduled_at < ?`;
  const params = [from, to];
  if (status && status !== 'todos') {
    sql += ` AND s.payment_status = ?`;
    params.push(status);
  }
  sql += ` ORDER BY s.scheduled_at`;
  return query(sql, params);
}

export async function getBillingSummary({ from, to }) {
  const { summarizeBillingRows } = await import('./billing-utils.js');
  const rows = await getBillingRows({ from, to, status: 'todos' });
  return summarizeBillingRows(rows);
}

export async function getUnscheduledSessions() {
  const rows = await query(
    `SELECT s.*, t.id AS treatment_id, t.number AS treatment_number,
            p.name AS patient_name
     ${SESSION_SCHEDULE_JOIN}
     WHERE s.scheduled_at IS NULL
       AND t.status = 'en_tratamiento'
     ORDER BY t.created_at DESC, s.number`,
  );
  return rows.map(mapScheduledRow);
}

export async function getSessionById(sessionId) {
  const [row] = await query(
    `SELECT s.*, t.id AS treatment_id, t.number AS treatment_number,
            p.name AS patient_name
     ${SESSION_SCHEDULE_JOIN}
     WHERE s.id = ?`,
    [sessionId],
  );
  return row ? mapScheduledRow(row) : null;
}
