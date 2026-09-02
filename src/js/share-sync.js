/**
 * Compartir un módulo con el paciente por enlace y traer su respuesta.
 *
 * El cuestionario se cifra en la app, el servidor solo guarda el sobre y la
 * llave viaja en el fragmento del enlace. Mientras haya módulos esperando
 * respuesta, la app consulta cada cierto rato y vuelca lo que llegó en la ficha.
 */
import { getModule, query } from './db.js';
import { syncModuleReadableText } from './readable-text.js';
import { getSubscriptionApiBase } from './subscription.js';
import { loadProfile } from './profile.js';
import { parseJsonSafe } from './utils.js';
import { decryptShare, encryptShare, generateShareKey } from '../lib/share-crypto.js';

/** Dominio que sirve la página del paciente (landing/r). */
export const SHARE_PUBLIC_BASE = 'https://telarapp.cl';

const POLL_MS = 60_000;

function apiUrl(path) {
  return `${getSubscriptionApiBase()}${path}`;
}

/** Enlace que se le manda al paciente: la llave nunca sale del fragmento. */
export function shareUrl({ token, key }) {
  return `${SHARE_PUBLIC_BASE}/r/${token}#${key}`;
}

/** Estado del envío guardado en el módulo, si hay alguno. */
export function shareInfo(data) {
  const parsed = typeof data === 'string' ? parseJsonSafe(data, {}) : data || {};
  const share = parsed?.share;
  if (!share?.token || !share?.key) return null;
  return share;
}

/**
 * Crea el enlace para un módulo y lo deja registrado en su `data.share`.
 * @param {object} moduleRow Fila de `session_modules`.
 * @param {{ def?: object, interactive?: object, patientAlias?: string }} content
 * @returns {Promise<{ url: string, token: string, expiresAt: string }>}
 */
export async function createModuleShareLink(moduleRow, { def, interactive, patientAlias } = {}) {
  const email = String(loadProfile().email || '').trim();
  if (!email) {
    throw new Error('Agrega tu correo en Ajustes para poder enviar enlaces a pacientes.');
  }
  if (!def && !interactive) throw new Error('Este módulo no se puede enviar por enlace.');

  const key = generateShareKey();
  const payload = interactive
    ? {
        kind: 'interactive',
        title: interactive.title,
        instructions: interactive.instructions || '',
        html: interactive.html,
        patientAlias: patientAlias || '',
      }
    : { kind: 'questionnaire', def, patientAlias: patientAlias || '' };

  const payload_ct = await encryptShare(key, payload);

  const res = await fetch(apiUrl('/api/share'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner_email: email, payload_ct }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'No se pudo crear el enlace. Revisa tu conexión.');
  }
  const { token, owner_secret, expires_at } = await res.json();

  const share = {
    token,
    key,
    secret: owner_secret,
    kind: interactive ? 'interactive' : 'questionnaire',
    storage: def?.storage || { kind: 'answers' },
    createdAt: new Date().toISOString(),
    expiresAt: expires_at,
  };
  const fresh = await getModule(moduleRow.id);
  await syncModuleReadableText(fresh || moduleRow, { share }, fresh?.status || moduleRow.status);

  return { url: shareUrl(share), token, expiresAt: expires_at };
}

/** Anula un enlace ya enviado. */
export async function revokeModuleShare(moduleRow) {
  const data = parseJsonSafe(moduleRow.data, {});
  const share = data.share;
  if (!share?.token) return;
  try {
    await fetch(apiUrl(`/api/share/${share.token}?secret=${encodeURIComponent(share.secret)}`), {
      method: 'DELETE',
    });
  } catch {
    /* si el servidor no responde, el enlace caduca solo */
  }
  const fresh = await getModule(moduleRow.id);
  await syncModuleReadableText(fresh || moduleRow, { share: null }, fresh?.status);
}

/** Traduce lo que respondió el paciente a los campos que guarda el módulo. */
function patchFromResponse(share, response) {
  if (share.kind === 'interactive') {
    return {
      payload: response?.payload ?? null,
      summary: typeof response?.summary === 'string' ? response.summary : '',
      completed_at: new Date().toISOString(),
    };
  }
  const answers = Array.isArray(response?.answers) ? response.answers : [];
  if (share.storage?.kind === 'field') {
    return { [share.storage.field]: answers[0] ?? '' };
  }
  return { answers };
}

/**
 * Consulta un módulo que está esperando respuesta.
 * @returns {Promise<boolean>} true si llegó y quedó guardada.
 */
export async function collectShareResponse(moduleRow) {
  const data = parseJsonSafe(moduleRow.data, {});
  const share = data.share;
  if (!share?.token || !share?.secret) return false;

  let res;
  try {
    res = await fetch(
      apiUrl(`/api/share/${share.token}/response?secret=${encodeURIComponent(share.secret)}`),
      { cache: 'no-store' },
    );
  } catch {
    return false;
  }

  // 410: caducó o ya se recogió antes. Se limpia para no seguir consultando.
  if (res.status === 410) {
    const fresh = await getModule(moduleRow.id);
    await syncModuleReadableText(fresh || moduleRow, { share: null }, fresh?.status);
    return false;
  }
  if (!res.ok) return false;

  const body = await res.json();
  if (!body.answered || !body.response_ct) return false;

  let response;
  try {
    response = await decryptShare(share.key, body.response_ct);
  } catch (e) {
    console.error('No se pudo descifrar la respuesta del paciente', e);
    return false;
  }

  const fresh = await getModule(moduleRow.id);
  await syncModuleReadableText(
    fresh || moduleRow,
    { ...patchFromResponse(share, response), share: null, share_answered_at: body.answered_at },
    'completado',
  );
  return true;
}

/** Módulos del tratamiento que están esperando respuesta del paciente. */
export async function pendingShareModules(treatmentId) {
  const rows = await query(
    `SELECT sm.id, sm.module_type, sm.status, sm.data
       FROM session_modules sm
       JOIN sessions s ON s.id = sm.session_id
      WHERE s.treatment_id = ? AND sm.data LIKE '%"share"%'`,
    [treatmentId],
  );
  return rows.filter((row) => shareInfo(row.data));
}

/**
 * Recoge todas las respuestas pendientes de un tratamiento.
 * @returns {Promise<number>} cuántas se guardaron.
 */
export async function syncPendingShares(treatmentId) {
  const pending = await pendingShareModules(treatmentId);
  let applied = 0;
  for (const row of pending) {
    if (await collectShareResponse(row)) applied += 1;
  }
  return applied;
}

/**
 * Consulta periódica mientras el workspace esté abierto.
 * @returns {() => void} para detenerla.
 */
export function startShareAutoSync(treatmentId, onApplied) {
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const applied = await syncPendingShares(treatmentId);
      if (applied > 0 && !stopped) onApplied?.(applied);
    } catch (e) {
      console.error(e);
    }
  };

  void tick();
  const timer = setInterval(tick, POLL_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
