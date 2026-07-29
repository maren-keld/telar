/** Stub repo público — sin límite Demo en GitHub; gates en instalador oficial. */
import { query } from './db.js';

export const FREE_ACTIVE_PATIENT_LIMIT = 999;

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
  return { count, limit: Infinity, pro: true, remaining: Infinity };
}

export async function wouldExceedActivePatientLimit() {
  return false;
}

export async function requireActivePatientSlot({ onAllowed } = {}) {
  onAllowed?.();
  return true;
}
