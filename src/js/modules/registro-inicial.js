import { bindAddressAutocomplete } from '../components/address-autocomplete.js';
import { bindOccupationPicker } from '../components/occupation-picker.js';
import { EDUCATION_OPTIONS, MARITAL_OPTIONS, PREVISION_OPTIONS, SOURCE_OPTIONS } from '../config.js';
import { upsertPatient } from '../db.js';
import { ICON_COPY } from '../icons.js';
import { syncModuleReadableText } from '../readable-text.js';
import { bindAutoSave } from '../autobind.js';
import { workspaceAutoSaveStatus } from '../save-status.js';
import {
  bindChileanRutInput,
  calcAge,
  escapeHtml,
  formatChileanRut,
  parseJsonSafe,
  toast,
} from '../utils.js';

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
  return { year, month, day };
}

function isoFromParts(year, month, day) {
  if (!year || !month || !day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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
    html += `<option value="${v}" ${String(selected) === v ? 'selected' : ''}>${name}</option>`;
  });
  return html;
}

function dayOptions(selected) {
  let html = '<option value="">Día</option>';
  for (let d = 1; d <= 31; d += 1) {
    const v = String(d);
    html += `<option value="${v}" ${String(selected) === v ? 'selected' : ''}>${d}</option>`;
  }
  return html;
}

export async function renderRegistroInicial(host, moduleRow, { treatment }) {
  const data = parseJsonSafe(moduleRow.data);
  const age = calcAge(data.birth_date);
  const generoInit = data.genero || 'femenino';
  const birth = birthParts(data.birth_date);

  host.innerHTML = `
    <div class="card">
      <h2 class="module-title">Registro inicial</h2>
      <form id="form-registro" class="grid-2">
        <div class="form-group">
          <label>Nombre</label>
          <input name="nombre" required data-sensitive value="${escapeHtml(data.nombre || treatment.patient_name || '')}" />
        </div>
        <div class="form-group">
          <label>Género</label>
          <div class="segmented" data-field="genero" data-no-autobind>
            <button type="button" data-val="femenino" class="${generoInit === 'femenino' ? 'active' : ''}">Femenino</button>
            <button type="button" data-val="masculino" class="${generoInit === 'masculino' ? 'active' : ''}">Masculino</button>
          </div>
        </div>
        <div class="form-group">
          <label>Número de ID (o RUT)</label>
          <input name="id_number" id="registro-rut" data-sensitive value="${escapeHtml(formatChileanRut(data.id_number || ''))}" placeholder="12.345.678-9" />
        </div>
        <div class="form-group">
          <label>Fecha de nacimiento</label>
          <div class="birth-date-row" data-no-autobind>
            <select id="birth-year" class="birth-date-select" aria-label="Año de nacimiento">${yearOptions(birth.year)}</select>
            <select id="birth-month" class="birth-date-select" aria-label="Mes de nacimiento">${monthOptions(birth.month)}</select>
            <select id="birth-day" class="birth-date-select" aria-label="Día de nacimiento">${dayOptions(birth.day)}</select>
            <span id="age-display" class="birth-age">${age != null ? `(${age} años)` : ''}</span>
          </div>
          <input type="hidden" name="birth_date" value="${escapeHtml(data.birth_date || '')}" />
        </div>
        <div class="form-group">
          <label>Correo electrónico</label>
          <div class="email-copy-row">
            <input name="email" type="email" value="${escapeHtml(data.email || '')}" />
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
          <input name="phone" data-sensitive value="${escapeHtml(data.phone || '')}" />
        </div>
        <div class="form-group">
          <label>Nivel de estudios</label>
          <select name="education_level">
            <option value="">Seleccionar…</option>
            ${EDUCATION_OPTIONS.map(
              (o) =>
                `<option ${data.education_level === o ? 'selected' : ''}>${escapeHtml(o)}</option>`,
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Fuente</label>
          <select name="source">
            ${SOURCE_OPTIONS.map(
              (o) => `<option ${data.source === o ? 'selected' : ''}>${escapeHtml(o)}</option>`,
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Previsión</label>
          <select name="prevision">
            ${PREVISION_OPTIONS.map((o) => {
              const selected =
                (data.prevision || 'Fonasa') === o ? 'selected' : '';
              return `<option ${selected}>${escapeHtml(o)}</option>`;
            }).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Ciudad</label>
          <input name="address" id="registro-address" placeholder="Buscar ciudad o comuna en Chile…" value="${escapeHtml(data.address || '')}" autocomplete="off" />
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

  let genero = generoInit;
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

  const persist = async () => {
    const form = host.querySelector('#form-registro');
    const fd = new FormData(form);
    const birth_date = syncBirthHidden();
    const payload = {
      nombre: fd.get('nombre'),
      id_number: fd.get('id_number'),
      email: fd.get('email'),
      phone: fd.get('phone'),
      address: fd.get('address'),
      genero,
      birth_date,
      marital_status: fd.get('marital_status'),
      source: fd.get('source'),
      prevision: fd.get('prevision') || 'Fonasa',
      education_level: fd.get('education_level') || '',
      occupations,
    };
    await upsertPatient({
      id: treatment.patient_id,
      name: payload.nombre,
      id_number: payload.id_number,
      email: payload.email,
      phone: payload.phone,
      address: payload.address,
      gender: genero,
      birth_date: payload.birth_date,
      marital_status: payload.marital_status,
      source: payload.source,
      occupations,
    });
    await syncModuleReadableText(moduleRow, payload, 'completado');
  };

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

  host.querySelectorAll('[data-field="genero"] button').forEach((btn) => {
    btn.addEventListener('click', () => {
      genero = btn.dataset.val;
      host.querySelectorAll('[data-field="genero"] button').forEach((b) => b.classList.toggle('active', b === btn));
      persist();
    });
  });

  ['#birth-year', '#birth-month', '#birth-day'].forEach((sel) => {
    host.querySelector(sel)?.addEventListener('change', () => {
      syncBirthHidden();
      persist();
    });
  });

  host.querySelector('#btn-copy-email')?.addEventListener('click', async () => {
    const email = host.querySelector('[name="email"]').value.trim();
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      toast('Email copiado');
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

  bindChileanRutInput(host.querySelector('#registro-rut'));
  bindAddressAutocomplete(host.querySelector('#registro-address'), { onSelect: persist });

  bindAutoSave(host.querySelector('#form-registro'), persist, workspaceAutoSaveStatus());
}
