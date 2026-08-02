import { opaqueCode, parseLocalISO } from './agenda-utils.js';
import { getInvoke } from './tauri-bridge.js';

const CRLF = '\r\n';

/** Escapa texto según RFC 5545. */
export function escapeIcsText(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** Pliega líneas a máximo 75 octetos (UTF-8). */
export function foldIcsLine(line) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(line);
  if (bytes.length <= 75) return line;

  const parts = [];
  let pos = 0;
  let first = true;
  while (pos < bytes.length) {
    const limit = first ? 75 : 74;
    let end = pos + limit;
    if (end > bytes.length) end = bytes.length;
    while (end > pos && (bytes[end] & 0xc0) === 0x80) end--;
    if (end === pos) end = Math.min(pos + limit, bytes.length);
    const chunk = new TextDecoder().decode(bytes.slice(pos, end));
    parts.push(first ? chunk : ' ' + chunk);
    first = false;
    pos = end;
  }
  return parts.join(CRLF);
}

function foldLines(lines) {
  return lines.map((l) => foldIcsLine(l)).join(CRLF);
}

function toUtcIcs(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const s = String(date.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${d}T${h}${min}${s}Z`;
}

function sessionEndUtc(session) {
  const start = parseLocalISO(session.scheduled_at);
  if (!start) return null;
  const dur = Number(session.duration_min) || 50;
  return new Date(start.getTime() + dur * 60_000);
}

/**
 * Construye un archivo iCalendar RFC 5545.
 * @param {Array} sessions — sesiones con scheduled_at, duration_min, treatment_id, id, attendance
 * @param {{ anonymous?: boolean }} opts
 */
export function buildIcs(sessions, { anonymous = true } = {}) {
  const now = new Date();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Telar//Agenda//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const session of sessions) {
    const start = parseLocalISO(session.scheduled_at);
    if (!start) continue;
    const end = sessionEndUtc(session);
    const code = opaqueCode(session.treatment_id);
    const summary = anonymous
      ? `Telar · Sesión — ${code}`
      : `Telar · Sesión — ${code}`;
    const description = anonymous ? 'Abrir en Telar' : 'Abrir en Telar';

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:telar-session-${session.id}@telarapp.cl`);
    lines.push(`DTSTAMP:${toUtcIcs(now)}`);
    lines.push(`DTSTART:${toUtcIcs(start)}`);
    lines.push(`DTEND:${toUtcIcs(end)}`);
    lines.push(`SUMMARY:${escapeIcsText(summary)}`);
    if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
    if (session.attendance === 'cancelada') {
      lines.push('STATUS:CANCELLED');
    } else {
      lines.push('STATUS:CONFIRMED');
    }
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push('DESCRIPTION:Recordatorio Telar');
    lines.push('TRIGGER:-PT1H');
    lines.push('END:VALARM');
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return foldLines(lines) + CRLF;
}

/**
 * Exporta sesiones agendadas a Documentos/Telar/calendario/.
 * @param {{ from: string, to: string, sessions: Array }} range
 */
export async function exportIcs(range) {
  const content = buildIcs(range.sessions, { anonymous: true });
  const filename = 'telar-agenda.ics';
  const path = await getInvoke()('save_calendar_export', {
    filename,
    content,
    reveal: true,
  });
  return path;
}
