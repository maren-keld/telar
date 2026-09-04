/**
 * Avisos cuando un paciente responde un test o handout por enlace.
 * El toast siempre sale. Escritorio y correo dependen de Ajustes.
 */
import { moduleLabelFor } from './custom-modules.js';
import { loadProfile } from './profile.js';
import { getSubscriptionApiBase, isLocalDevFrontend } from './subscription.js';
import { getInvoke, isTauriApp } from './tauri-bridge.js';
import { invokeErrorMessage, parseJsonSafe, toast } from './utils.js';

/** Cuándo llegó la última respuesta por enlace. */
export function shareAnsweredAt(data) {
  const parsed = typeof data === 'string' ? parseJsonSafe(data, {}) : data || {};
  return parsed.share_answered_at || null;
}

export function formatShareArrivalMessage(item) {
  const session = item?.sessionNumber != null ? String(item.sessionNumber) : '—';
  const moduleName = item?.moduleLabel || moduleLabelFor(item?.moduleType) || 'módulo';
  const patient = String(item?.patientName || '').trim() || 'tu paciente';
  return `Llegaron las respuestas de la sesión ${session} del módulo ${moduleName} de tu paciente ${patient}`;
}

export function formatShareAnsweredAt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('es-CL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function announceShareResponses(items) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!list.length) return;
  if (list.length === 1) {
    toast(formatShareArrivalMessage(list[0]));
  } else {
    const bits = list.map((item) => {
      const session = item?.sessionNumber != null ? `sesión ${item.sessionNumber}` : 'sesión';
      const moduleName = item?.moduleLabel || moduleLabelFor(item?.moduleType) || 'módulo';
      const patient = String(item?.patientName || '').trim();
      return patient ? `${session} · ${moduleName} (${patient})` : `${session} · ${moduleName}`;
    });
    toast(`Llegaron ${list.length} respuestas: ${bits.join('; ')}`);
  }
  for (const item of list) {
    void notifyShareChannels(item);
  }
}

async function notifyShareChannels(item) {
  const profile = loadProfile();
  const text = formatShareArrivalMessage(item);
  if (profile.notifyShareDesktop !== false) {
    await showDesktopNotification('Telar', text);
  }
  if (profile.notifyShareEmail) {
    await sendShareEmail(text);
  }
}

async function showDesktopNotification(title, body) {
  if (isTauriApp()) {
    try {
      await getInvoke()('show_desktop_notification', { title, body });
      return;
    } catch (err) {
      console.warn('Notificación de escritorio:', invokeErrorMessage(err, err?.message || ''));
    }
  }
  try {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  } catch {
    /* el toast ya avisó */
  }
}

async function sendShareEmail(text) {
  const email = String(loadProfile().email || '').trim();
  if (!email) return;
  const subject = 'Telar: respondieron un formulario';
  const base = getSubscriptionApiBase();
  if (!isTauriApp() || isLocalDevFrontend()) {
    try {
      const res = await fetch(`${base}/api/share/notify-owner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, subject, text }),
      });
      if (!res.ok) throw new Error('No se pudo enviar el correo');
    } catch (err) {
      console.warn('Correo de respuesta:', err?.message || err);
    }
    return;
  }
  try {
    await getInvoke()('share_notify_owner', { apiBase: base, email, subject, text });
  } catch (err) {
    console.warn('Correo de respuesta:', invokeErrorMessage(err, err?.message || ''));
  }
}
