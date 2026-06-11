export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function calcAge(birthDateStr) {
  if (!birthDateStr) return null;
  const d = new Date(birthDateStr);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) age--;
  return age;
}

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('es-CL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function toast(message, ms = 3200) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

export function parseJsonSafe(raw, fallback = {}) {
  try {
    return typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || fallback;
  } catch {
    return fallback;
  }
}

/** Iniciales del profesional (ej. «María López» → ML). */
export function practitionerInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Formato visual RUT chileno: 12.345.678-9 */
export function formatChileanRut(value) {
  const clean = String(value || '')
    .replace(/[^0-9kK]/gi, '')
    .toUpperCase()
    .slice(0, 9);
  if (!clean) return '';
  const dv = clean.length > 1 ? clean.slice(-1) : '';
  const num = (clean.length > 1 ? clean.slice(0, -1) : clean).replace(/\D/g, '').slice(0, 8);
  if (!num) return dv;
  const reversed = num.split('').reverse();
  const withDots = [];
  reversed.forEach((ch, i) => {
    if (i > 0 && i % 3 === 0) withDots.push('.');
    withDots.push(ch);
  });
  const body = withDots.reverse().join('');
  return dv ? `${body}-${dv}` : body;
}

function countRutCharsBefore(str, caret) {
  let n = 0;
  const limit = Math.min(caret, str.length);
  for (let i = 0; i < limit; i++) {
    if (/[0-9kK]/i.test(str[i])) n++;
  }
  return n;
}

function caretFromRutCharIndex(formatted, charIndex) {
  if (charIndex <= 0) return 0;
  let n = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/[0-9kK]/i.test(formatted[i])) {
      n++;
      if (n >= charIndex) return i + 1;
    }
  }
  return formatted.length;
}

export function bindChileanRutInput(input) {
  if (!input) return;
  input.addEventListener('input', () => {
    const caret = input.selectionStart ?? input.value.length;
    const charsBefore = countRutCharsBefore(input.value, caret);
    const formatted = formatChileanRut(input.value);
    input.value = formatted;
    const newCaret = caretFromRutCharIndex(formatted, charsBefore);
    try {
      input.setSelectionRange(newCaret, newCaret);
    } catch {
      /* ignore */
    }
  });
  input.addEventListener('blur', () => {
    input.value = formatChileanRut(input.value);
  });
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copiado al portapapeles');
  } catch {
    toast('No se pudo copiar');
  }
}
