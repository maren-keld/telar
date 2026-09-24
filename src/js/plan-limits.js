/**
 * Límites del plan Demo vs Pro.
 *
 * Demo: hasta FREE_ACTIVE_PATIENT_LIMIT pacientes distintos registrados con tratamiento.
 *        El estado del tratamiento (incluido archivado) no libera cupo.
 * Pro: pacientes ilimitados; grabación/export NF y respaldo en nube (otros gates).
 */
import { openSubscribeProModal } from './components/subscribe-pro-modal.js';
import { query } from './db.js';
import { isProUser } from './profile.js';
import { FREE_ACTIVE_PATIENT_LIMIT } from './subscription-config.js';
import { syncProFromServer } from './subscription.js';

export { FREE_ACTIVE_PATIENT_LIMIT };

export async function countActivePatients() {
  const [row] = await query(
    `SELECT COUNT(DISTINCT patient_id) AS n FROM treatments`,
  );
  return Number(row?.n || 0);
}

export async function patientHasActiveTreatment(patientId) {
  if (patientId == null) return false;
  const [row] = await query(
    `SELECT COUNT(*) AS n FROM treatments WHERE patient_id = ?`,
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
 * ¿Crear / reactivar un tratamiento supera el tope Demo?
 * Un paciente existente no vuelve a consumir cupo al iniciar otro tratamiento.
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
  if (isProUser()) {
    onAllowed?.();
    return true;
  }

  const atLimit = await wouldExceedActivePatientLimit({ patientId });
  if (!atLimit) {
    onAllowed?.();
    void syncProFromServer().catch(() => {});
    return true;
  }

  const { nowPro } = await syncProFromServer();
  if (nowPro) {
    onAllowed?.();
    return true;
  }

  openSubscribeProModal({
    onSubscribed: () => onAllowed?.(),
  });
  return false;
}
