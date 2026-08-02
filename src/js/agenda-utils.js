/** Utilidades puras de calendario y cobros (sin DOM ni DB). */

export function opaqueCode(treatmentId) {
  return `TL-${String(treatmentId).padStart(4, '0')}`;
}

/** Lunes = inicio de semana (Chile). */
export function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function endOfWeek(date) {
  const s = startOfWeek(date);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  return e;
}

export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function addWeeks(date, n) {
  return addDays(date, n * 7);
}

export function addMonths(date, n) {
  return new Date(date.getFullYear(), date.getMonth() + n, date.getDate());
}

export function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isToday(date) {
  return isSameDay(date, new Date());
}

/** 'YYYY-MM-DDTHH:MM' en hora local, sin UTC. */
export function toLocalISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${h}:${min}`;
}

/** Parsea 'YYYY-MM-DDTHH:MM' como hora local. */
export function parseLocalISO(str) {
  if (!str) return null;
  const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    0,
    0,
  );
}

/** Solo fecha 'YYYY-MM-DD'. */
export function toDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateISO(str) {
  if (!str) return null;
  const m = String(str).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function formatCLP(n) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);
}

/** Matriz 6×7 de días para la grilla mensual. */
export function monthGrid(date) {
  const first = startOfMonth(date);
  const gridStart = startOfWeek(first);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    cells.push({ date: d, inMonth: d.getMonth() === date.getMonth() });
  }
  const rows = [];
  for (let r = 0; r < 6; r++) {
    rows.push(cells.slice(r * 7, r * 7 + 7));
  }
  return rows;
}

/** ¿Se solapan dos bloques con scheduled_at + duration_min? */
export function overlaps(a, b) {
  const startA = parseLocalISO(a.scheduled_at);
  const startB = parseLocalISO(b.scheduled_at);
  if (!startA || !startB) return false;
  const endA = new Date(startA.getTime() + (a.duration_min || 50) * 60_000);
  const endB = new Date(startB.getTime() + (b.duration_min || 50) * 60_000);
  return startA < endB && startB < endA;
}

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const MONTHS_SHORT_ES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

export function formatMonthYear(date) {
  return `${MONTHS_ES[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatWeekRange(date) {
  const s = startOfWeek(date);
  const e = endOfWeek(date);
  const sm = MONTHS_SHORT_ES[s.getMonth()];
  const em = MONTHS_SHORT_ES[e.getMonth()];
  if (s.getMonth() === e.getMonth()) {
    return `${s.getDate()} – ${e.getDate()} ${sm} ${e.getFullYear()}`;
  }
  return `${s.getDate()} ${sm} – ${e.getDate()} ${em} ${e.getFullYear()}`;
}

export function formatDayLong(date) {
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return `${days[date.getDay()]}, ${date.getDate()} ${MONTHS_ES[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatTime(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}
