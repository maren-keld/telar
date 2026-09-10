import { bindAddressAutocomplete } from '../components/address-autocomplete.js';
import { bindOccupationPicker } from '../components/occupation-picker.js';
import {
  bindNationalIdInput,
  clinicCountryCode,
  coverageOptions,
  formatNationalId,
  idSpecFor,
} from '../clinic-country.js';
import { EDUCATION_OPTIONS, MARITAL_OPTIONS, PATIENT_GENDER_OPTIONS, SOURCE_OPTIONS, normalizeEducationLevel } from '../config.js';
import { savePatientAndModule } from '../db.js';
import { ICON_COPY } from '../icons.js';
import { finishModuleSave, mergeModuleReadable } from '../readable-text.js';
import { bindAutoSave, queuedPersist } from '../autobind.js';
import { notifySaveError, workspaceAutoSaveStatus } from '../save-status.js';
import { calcAge, escapeHtml, parseJsonSafe, toast } from '../utils.js';

const OCCUPATION_OPTIONS = [
  'Trabajador independiente',
  'Trabajador dependiente',
  'Estudiante',
  'Trabajador de hogar',
];

function birthParts(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return { year: '', month: '', day: '' };
  }
  const [year, month, day] = iso.split('-');
  // Los <option> usan "3", no "03"; sin Number() el select queda vacío y el
  // siguiente autoguardado borra la fecha de nacimiento.
  return {
    year: String(Number(year) || ''),
    month: String(Number(month) || ''),
    day: String(Number(day) || ''),
  };
}

function isoFromParts(year, month, day) {
  if (!year || !month || !day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Expuesto para tests: el select debe reconocer meses/días con cero a la izquierda. */
export { birthParts, isoFromParts };

/**
 * Lo que se pinta: módulo, y si falta, la fila del paciente (alta con RUT, etc.).
 * Vaciar a propósito un dato nunca mostrado no aplica: ver coherentRegistroPayload.
 */
export function seedRegistroFields(data = {}, treatment = {}, country = clinicCountryCode()) {
  const idRaw = data.id_number || treatment.patient_id_number || '';
  return {
    nombre: String(data.nombre || treatment.patient_name || ''),
    id_number: formatNationalId(idRaw, country) || String(idRaw || ''),
    email: String(data.email || treatment.patient_email || ''),
    phone: String(data.phone || treatment.patient_phone || ''),
    address: String(data.address || treatment.patient_address || ''),
    genero: String(data.genero || treatment.patient_gender || ''),
    birth_date: String(data.birth_date || treatment.patient_birth_date || ''),
  };
}

function firstStored(stored, keys) {
  for (const key of keys) {
    const value = stored?.[key];
    if (value != null && String(value).trim()) return value;
  }
  return '';
}

function pickIdentityField(formVal, seededVal, storedVal) {
  const form = String(formVal ?? '');
  const seeded = String(seededVal ?? '').trim();
  if (form.trim()) return form;
  if (seeded) return '';
  return storedVal == null ? form : storedVal;
}

/**
 * Un objeto para patients y session_modules.
 * Si el input se mostró con valor y el usuario lo borra, ambas copias quedan vacías.
 * Si nunca se mostró (seed vacío) y la DB sí tenía valor, se conserva en las dos.
 */
export function coherentRegistroPayload({ form = {}, seeded = {}, stored = {} } = {}) {
  return {
    nombre: pickIdentityField(form.nombre, seeded.nombre, firstStored(stored, ['nombre', 'name', 'patient_name'])),
    id_number: pickIdentityField(
      form.id_number,
      seeded.id_number,
      firstStored(stored, ['id_number', 'patient_id_number']),
    ),
    email: pickIdentityField(form.email, seeded.email, firstStored(stored, ['email', 'patient_email'])),
    phone: pickIdentityField(form.phone, seeded.phone, firstStored(stored, ['phone', 'patient_phone'])),
    address: pickIdentityField(form.address, seeded.address, firstStored(stored, ['address', 'patient_address'])),
  };
}

function normalizeGenero(raw) {
  const value = String(raw || '').trim();
  if (PATIENT_GENDER_OPTIONS.some((o) => o.id === value)) return value;
  const lower = value.toLowerCase();
  if (lower === 'f') return 'femenino';
  if (lower === 'm') return 'masculino';
  const byLabel = PATIENT_GENDER_OPTIONS.find((o) => o.label.toLowerCase() === lower);
  return byLabel?.id || '';
}

function yearOptions(selected) {
  const now = new Date().getFullYear();
  let html = '<option value="">Año</option>';
  for (let y = now; y >= now - 100; y -= 1) {
    html += `<option value="${y}" ${String(selected) === String(y) ? 'selected' : ''}>${y}</option>`;
  }
  return html;
}

function monthOptions(selected) {
  const names = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];
  let html = '<option value="">Mes</option>';
  names.forEach((name, i) => {
    const v = String(i + 1);
    const selectedMatch = Number(selected) === i + 1;
    html += `<option value="${v}" ${selectedMatch ? 'selected' : ''}>${name}</option>`;
  });
  return html;
}

function dayOptions(selected) {
  let html = '<option value="">Día</option>';
  for (let d = 1; d <= 31; d += 1) {
    const v = String(d);
    const selectedMatch = Number(selected) === d;
    html += `<option value="${v}" ${selectedMatch ? 'selected' : ''}>${d}</option>`;
  }
  return html;
}

export async function renderRegistroInicial(host, moduleRow, { treatment }) {
  const data = parseJsonSafe(moduleRow.data);
  const country = clinicCountryCode();
  const seeded = seedRegistroFields(data, treatment, country);
  const age = calcAge(seeded.birth_date);
  const generoInit = normalizeGenero(seeded.genero || data.genero);
  const birth = birthParts(seeded.birth_date);
  const idSpec = idSpecFor(country);
  const coverage = coverageOptions(data.prevision, country);
  const educationLevel = normalizeEducationLevel(data.education_level);

  host.innerHTML = `
    <div class="card">
      <h2 class="module-title">Registro inicial</h2>
      <form id="form-registro" class="grid-2">
        <div class="form-group">
          <label>Nombre</label>
          <input name="nombre" required data-sensitive value="${escapeHtml(seeded.nombre)}" />
        </div>
        <div class="form-group">
          <label for="registro-genero">Género</label>
          <select name="genero" id="registro-genero">
            <option value="">Seleccionar…</option>
            ${PATIENT_GENDER_OPTIONS.map(
              (o) =>
                `<option value="${escapeHtml(o.id)}" ${generoInit === o.id ? 'selected' : ''}>${escapeHtml(o.label)}</option>`,
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>${escapeHtml(idSpec.label)}</label>
          <input name="id_number" id="registro-rut" data-sensitive value="${escapeHtml(seeded.id_number)}" placeholder="${escapeHtml(idSpec.placeholder)}" />
        </div>
        <div class="form-group">
          <label>Fecha de nacimiento</label>
          <div class="birth-date-row" data-no-autobind>
            <select id="birth-year" class="birth-date-select" aria-label="Año de nacimiento">${yearOptions(birth.year)}</select>
            <select id="birth-month" class="birth-date-select" aria-label="Mes de nacimiento">${monthOptions(birth.month)}</select>
            <select id="birth-day" class="birth-date-select" aria-label="Día de nacimiento">${dayOptions(birth.day)}</select>
            <span id="age-display" class="birth-age">${age != null ? `(${age} años)` : ''}</span>
          </div>
          <input type="hidden" name="birth_date" value="${escapeHtml(seeded.birth_date)}" />
        </div>
        <div class="form-group">
          <label>Correo electrónico</label>
          <div class="email-copy-row">
            <input name="email" type="email" value="${escapeHtml(seeded.email)}" />
            <button type="button" class="btn btn-secondary btn-icon" id="btn-copy-email" title="Copiar correo" data-no-autobind aria-label="Copiar correo">${ICON_COPY}</button>
          </div>
        </div>
        <div class="form-group">
          <label>Estado marital</label>
          <select name="marital_status">
            ${MARITAL_OPTIONS.map(
              (o) =>
                `<option ${data.marital_status === o ? 'selected' : ''}>${escapeHtml(o)}</option>`,
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Celular</label>
          <input name="phone" data-sensitive value="${escapeHtml(seeded.phone)}" />
        </div>
        <div class="form-group">
          <label>Nivel de estudios</label>
          <select name="education_level">
            <option value="">Seleccionar…</option>
            ${EDUCATION_OPTIONS.map(
              (o) =>
                `<option ${educationLevel === o ? 'selected' : ''}>${escapeHtml(o)}</option>`,
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Cómo llegaste</label>
          <select name="source">
            <option value="">Seleccionar…</option>
            ${SOURCE_OPTIONS.map(
              (o) =>
                `<option value="${escapeHtml(o)}" ${data.source === o ? 'selected' : ''}>${escapeHtml(o)}</option>`,
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>${escapeHtml(coverage.spec.label)}</label>
          <select name="prevision">
            ${coverage.options.map((o) => {
              const selected = coverage.selected === o ? 'selected' : '';
              return `<option ${selected}>${escapeHtml(o)}</option>`;
            }).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Ciudad</label>
          <input name="address" id="registro-address" placeholder="Ciudad o comuna" value="${escapeHtml(seeded.address)}" autocomplete="off" />
        </div>
        <div class="form-group" data-no-autobind>
          <label>Ocupaciones</label>
          <div class="occupation-picker" id="occupation-picker">
            <button type="button" class="occupation-picker__trigger" id="occupation-trigger" aria-haspopup="listbox" aria-expanded="false">
              <span id="occupation-summary">Seleccionar ocupaciones…</span>
            </button>
            <div class="occupation-picker__menu" id="occupation-menu" hidden aria-hidden="true"></div>
          </div>
        </div>
      </form>
    </div>`;

  let occupations = Array.isArray(data.occupations)
    ? data.occupations.filter((o) => OCCUPATION_OPTIONS.includes(o))
    : [];

  const syncBirthHidden = () => {
    const year = host.querySelector('#birth-year')?.value;
    const month = host.querySelector('#birth-month')?.value;
    const day = host.querySelector('#birth-day')?.value;
    const iso = isoFromParts(year, month, day);
    const hidden = host.querySelector('[name="birth_date"]');
    if (hidden) hidden.value = iso;
    const a = calcAge(iso);
    const ageEl = host.querySelector('#age-display');
    if (ageEl) ageEl.textContent = a != null ? `(${a} años)` : '';
    return iso;
  };

  const updateOccupationSummary = () => {
    const summary = host.querySelector('#occupation-summary');
    if (!summary) return;
    summary.textContent = occupations.length
      ? occupations.join(', ')
      : 'Seleccionar ocupaciones…';
  };

  const syncOccupationChecks = () => {
    updateOccupationSummary();
  };

  const persistRaw = async () => {
    const formEl = host.querySelector('#form-registro');
    if (!formEl) return;
    const fd = new FormData(formEl);
    const birth_date = syncBirthHidden();
    const form = {
      nombre: fd.get('nombre') ?? '',
      id_number: fd.get('id_number') ?? '',
      email: fd.get('email') ?? '',
      phone: fd.get('phone') ?? '',
      address: fd.get('address') ?? '',
    };
    const identity = coherentRegistroPayload({
      form,
      seeded,
      stored: {
        ...data,
        name: treatment.patient_name,
        patient_name: treatment.patient_name,
        patient_id_number: treatment.patient_id_number,
        patient_email: treatment.patient_email,
        patient_phone: treatment.patient_phone,
        patient_address: treatment.patient_address,
      },
    });
    const payload = {
      nombre: identity.nombre,
      id_number: identity.id_number,
      email: identity.email,
      phone: identity.phone,
      address: identity.address,
      genero: fd.get('genero') || '',
      birth_date,
      marital_status: fd.get('marital_status'),
      source: fd.get('source'),
      prevision: fd.get('prevision') || coverage.spec.defaultOption,
      education_level: normalizeEducationLevel(fd.get('education_level') || ''),
      occupations,
    };
    const merged = mergeModuleReadable(moduleRow, payload);
    await savePatientAndModule({
      patient: {
        id: treatment.patient_id,
        name: payload.nombre,
        id_number: payload.id_number,
        email: payload.email,
        phone: payload.phone,
        address: payload.address,
        gender: payload.genero,
        birth_date: payload.birth_date,
        marital_status: payload.marital_status,
        source: payload.source,
        occupations,
      },
      moduleId: moduleRow.id,
      data: merged,
      status: 'completado',
    });
    finishModuleSave(moduleRow, merged, 'completado');
  };

  const persist = queuedPersist(persistRaw, notifySaveError);

  syncOccupationChecks();

  bindOccupationPicker(host, {
    options: OCCUPATION_OPTIONS,
    getSelected: () => occupations,
    onChange: (value, checked) => {
      if (checked) {
        if (!occupations.includes(value)) occupations.push(value);
      } else {
        occupations = occupations.filter((o) => o !== value);
      }
      persist();
    },
  });

  ['#birth-year', '#birth-month', '#birth-day'].forEach((sel) => {
    host.querySelector(sel)?.addEventListener('change', () => {
      syncBirthHidden();
      persist();
    });
  });

  host.querySelector('#btn-copy-email')?.addEventListener('click', async () => {
    const email = host.querySelector('[name="email"]').value.trim();
    if (!email) {
      toast('No hay correo para copiar');
      return;
    }
    try {
      await navigator.clipboard.writeText(email);
      toast('Correo copiado');
    } catch {
      toast('No se pudo copiar');
    }
  });

  // Actualizar nombre del paciente en #leftsidebar en tiempo real
  host.querySelector('[name="nombre"]')?.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    const sidebarNameEl = document.querySelector('#leftsidebar .workspace-patient-name');
    if (sidebarNameEl) {
      const suffix = treatment.number > 1 ? ` ${treatment.number}` : '';
      sidebarNameEl.textContent = (val || treatment.patient_name || 'Sin nombre') + suffix;
    }
  });

  bindNationalIdInput(host.querySelector('#registro-rut'), country);
  bindAddressAutocomplete(host.querySelector('#registro-address'), { onSelect: persist, country });

  bindAutoSave(host.querySelector('#form-registro'), persistRaw, workspaceAutoSaveStatus());
}
