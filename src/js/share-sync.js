/**
 * Compartir un módulo con el paciente por enlace y traer su respuesta.
 *
 * El cuestionario se cifra en la app, el servidor solo guarda el sobre y la
 * llave viaja en el fragmento del enlace. Mientras haya módulos esperando
 * respuesta, la app consulta cada cierto rato y vuelca lo que llegó en la ficha.
 */
import { getModule, query } from './db.js';
import { moduleLabelFor } from './custom-modules.js';
import { syncModuleReadableText } from './readable-text.js';
import { getSubscriptionApiBase, isLocalDevFrontend } from './subscription.js';
import { loadProfile } from './profile.js';
import { invokeErrorMessage, parseJsonSafe } from './utils.js';
import { decryptShare, encryptShare, generateShareKey } from '../lib/share-crypto.js';
import { getInvoke, isTauriApp } from './tauri-bridge.js';
import { announceShareResponses, shareAnsweredAt } from './share-notify.js';

export { shareAnsweredAt };

/** Dominio que sirve la página del paciente (landing/r). */
export const SHARE_PUBLIC_BASE = 'https://telarapp.cl';

const POLL_MS = 20_000;

function apiUrl(path) {
  return `${getSubscriptionApiBase()}${path}`;
}

/** En la .app el fetch del webview falla (Load failed); las suscripciones ya van por Rust. */
function useShareFetch() {
  return !isTauriApp() || isLocalDevFrontend();
}

async function shareCreateRequest(ownerEmail, payloadCt) {
  const base = getSubscriptionApiBase();
  if (useShareFetch()) {
    const res = await fetch(apiUrl('/api/share'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner_email: ownerEmail, payload_ct: payloadCt }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'No se pudo crear el enlace. Revisa tu conexión.');
    return body;
  }
  try {
    return await getInvoke()('share_create', { apiBase: base, ownerEmail, payloadCt });
  } catch (err) {
    throw new Error(invokeErrorMessage(err, 'No se pudo crear el enlace. Revisa tu conexión.'));
  }
}

async function shareCollectRequest(token, secret) {
  const base = getSubscriptionApiBase();
  if (useShareFetch()) {
    const res = await fetch(
      apiUrl(`/api/share/${token}/response?secret=${encodeURIComponent(secret)}`),
      { cache: 'no-store' },
    );
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }
  try {
    const body = await getInvoke()('share_collect', { apiBase: base, token, secret });
    if (body?.gone) return { status: 410, body };
    return { status: 200, body };
  } catch (err) {
    throw new Error(invokeErrorMessage(err, 'No se pudo consultar la respuesta.'));
  }
}

async function shareRevokeRequest(token, secret) {
  const base = getSubscriptionApiBase();
  if (useShareFetch()) {
    await fetch(apiUrl(`/api/share/${token}?secret=${encodeURIComponent(secret)}`), {
      method: 'DELETE',
    });
    return;
  }
  try {
    await getInvoke()('share_revoke', { apiBase: base, token, secret });
  } catch {
    /* si el servidor no responde, el enlace caduca solo */
  }
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


async function shareContextFor(moduleRow) {
  if (moduleRow.session_number != null && moduleRow.patient_name) {
    return {
      sessionNumber: moduleRow.session_number,
      patientName: moduleRow.patient_name,
      treatmentId: moduleRow.treatment_id,
    };
  }
  const [row] = await query(
    `SELECT s.number AS session_number, s.treatment_id, p.name AS patient_name
       FROM session_modules sm
       JOIN sessions s ON s.id = sm.session_id
       JOIN treatments t ON t.id = s.treatment_id
       JOIN patients p ON p.id = t.patient_id
      WHERE sm.id = ?`,
    [moduleRow.id],
  );
  return {
    sessionNumber: row?.session_number,
    patientName: row?.patient_name || '',
    treatmentId: row?.treatment_id,
  };
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

  const { token, owner_secret, expires_at } = await shareCreateRequest(email, payload_ct);

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
    await shareRevokeRequest(share.token, share.secret);
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
 * Aplica la respuesta al módulo (completado) sin que el clínico abra el modal.
 * @returns {Promise<object|null>} contexto de lo aplicado, o null.
 */
export async function collectShareResponse(moduleRow) {
  const data = parseJsonSafe(moduleRow.data, {});
  const share = data.share;
  if (!share?.token || !share?.secret) return null;

  let status;
  let body;
  try {
    ({ status, body } = await shareCollectRequest(share.token, share.secret));
  } catch {
    return null;
  }

  // 410: caducó o ya se recogió antes. Se limpia para no seguir consultando.
  if (status === 410 || body?.gone) {
    const fresh = await getModule(moduleRow.id);
    await syncModuleReadableText(fresh || moduleRow, { share: null }, fresh?.status);
    return null;
  }
  if (status < 200 || status >= 300) return null;

  if (!body.answered || !body.response_ct) return null;

  let response;
  try {
    response = await decryptShare(share.key, body.response_ct);
  } catch (e) {
    console.error('No se pudo descifrar la respuesta del paciente', e);
    return null;
  }

  const ctx = await shareContextFor(moduleRow);
  const fresh = await getModule(moduleRow.id);
  const patch = patchFromResponse(share, response);
  /* No borres un payload previo si el paciente solo mandó el resumen (Telar.done). */
  if (share.kind === 'interactive' && patch.payload == null) delete patch.payload;
  await syncModuleReadableText(
    fresh || moduleRow,
    { ...patch, share: null, share_answered_at: body.answered_at },
    'completado',
  );
  return {
    moduleId: moduleRow.id,
    moduleType: moduleRow.module_type,
    moduleLabel: moduleLabelFor(moduleRow.module_type),
    sessionNumber: ctx.sessionNumber,
    patientName: ctx.patientName,
    treatmentId: ctx.treatmentId,
    answeredAt: body.answered_at,
  };
}

/** Módulos esperando respuesta. Sin treatmentId: todos los tratamientos. */
export async function pendingShareModules(treatmentId) {
  const rows = treatmentId
    ? await query(
        `SELECT sm.id, sm.module_type, sm.status, sm.data,
                s.number AS session_number, s.treatment_id, p.name AS patient_name
           FROM session_modules sm
           JOIN sessions s ON s.id = sm.session_id
           JOIN treatments t ON t.id = s.treatment_id
           JOIN patients p ON p.id = t.patient_id
          WHERE s.treatment_id = ? AND sm.data LIKE '%"share"%'`,
        [treatmentId],
      )
    : await query(
        `SELECT sm.id, sm.module_type, sm.status, sm.data,
                s.number AS session_number, s.treatment_id, p.name AS patient_name
           FROM session_modules sm
           JOIN sessions s ON s.id = sm.session_id
           JOIN treatments t ON t.id = s.treatment_id
           JOIN patients p ON p.id = t.patient_id
          WHERE sm.data LIKE '%"share"%'`,
      );
  return rows.filter((row) => shareInfo(row.data));
}

/**
 * Recoge respuestas pendientes.
 * @returns {Promise<object[]>} ítems aplicados.
 */
export async function syncPendingShares(treatmentId) {
  const pending = await pendingShareModules(treatmentId);
  const applied = [];
  for (const row of pending) {
    const item = await collectShareResponse(row);
    if (item) applied.push(item);
  }
  return applied;
}

let globalShareSyncStop = null;

/**
 * Consulta periódica en toda la app (no depende de abrir el módulo).
 * También consulta inmediatamente al volver del background (el paciente
 * pudo responder mientras la app estaba minimizada y Render dormido).
 * @returns {() => void} para detenerla.
 */
export function startShareAutoSync(onApplied) {
  if (globalShareSyncStop) return globalShareSyncStop;
  let stopped = false;
  let running = false;

  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const applied = await syncPendingShares();
      if (applied.length > 0 && !stopped) {
        announceShareResponses(applied);
        document.dispatchEvent(new CustomEvent('telar:share-applied', { detail: { items: applied } }));
        onApplied?.(applied);
      }
    } catch (e) {
      console.error('[share-sync] poll falló:', e?.message || e);
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(tick, POLL_MS);

  /* Al volver del background/minimizado: tick inmediato sin esperar 20 s. */
  const onVisible = () => {
    if (document.visibilityState === 'visible' && !stopped) void tick();
  };
  document.addEventListener('visibilitychange', onVisible);

  globalShareSyncStop = () => {
    stopped = true;
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    globalShareSyncStop = null;
  };
  return globalShareSyncStop;
}

/** Arranca el poll global una sola vez, cuando la ficha ya está desbloqueada. */
export function ensureGlobalShareSync() {
  startShareAutoSync();
}
