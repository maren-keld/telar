/**
 * Límites del plan Demo vs Pro.
 *
 * Demo: hasta FREE_ACTIVE_PATIENT_LIMIT pacientes distintos con ≥1 tratamiento
 *        en estado "en_tratamiento" (archivados, completados o en pausa no cuentan).
 * Pro: pacientes ilimitados; grabación/export NF y export PDF de programa (otros gates).
 */
import { openSubscribeProModal } from './components/subscribe-pro-modal.js';
import { query } from './db.js';
import { isProUser } from './profile.js';
import { FREE_ACTIVE_PATIENT_LIMIT } from './subscription-config.js';
import { syncProFromServer } from './subscription.js';

export { FREE_ACTIVE_PATIENT_LIMIT };

export async function countActivePatients() {
  const [row] = await query(
    `SELECT COUNT(DISTINCT patient_id) AS n FROM treatments WHERE status = 'en_tratamiento'`,
  );
  return Number(row?.n || 0);
}

export async function patientHasActiveTreatment(patientId) {
  if (patientId == null) return false;
  const [row] = await query(
    `SELECT COUNT(*) AS n FROM treatments WHERE patient_id = ? AND status = 'en_tratamiento'`,
    [patientId],
  );
  return Number(row?.n || 0) > 0;
}

export async function getActivePatientUsage() {
  const count = await countActivePatients();
  const pro = isProUser();
  return {
    count,
    limit: FREE_ACTIVE_PATIENT_LIMIT,
    pro,
    remaining: pro ? Infinity : Math.max(0, FREE_ACTIVE_PATIENT_LIMIT - count),
  };
}

/**
 * ¿Crear / reactivar un paciente activo supera el tope Demo?
 * @param {{ patientId?: number|null }} opts - Si el paciente ya está activo, no consume cupo nuevo.
 */
export async function wouldExceedActivePatientLimit({ patientId = null } = {}) {
  if (isProUser()) return false;
  if (patientId != null && (await patientHasActiveTreatment(patientId))) return false;
  const count = await countActivePatients();
  return count >= FREE_ACTIVE_PATIENT_LIMIT;
}

/**
 * Bloquea creación/reactivación si Demo está al tope. Abre modal Pro.
 * @returns {Promise<boolean>} true si puede continuar
 */
export async function requireActivePatientSlot({ patientId = null, onAllowed } = {}) {
  const { nowPro } = await syncProFromServer();
  if (nowPro || isProUser()) {
    onAllowed?.();
    return true;
  }
  if (!(await wouldExceedActivePatientLimit({ patientId }))) {
    onAllowed?.();
    return true;
  }
  openSubscribeProModal({
    onSubscribed: () => onAllowed?.(),
  });
  return false;
}
