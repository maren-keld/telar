import { bindAddressAutocomplete } from '../components/address-autocomplete.js';
import { EDUCATION_OPTIONS, MARITAL_OPTIONS, PREVISION_OPTIONS, SOURCE_OPTIONS } from '../config.js';
import { upsertPatient } from '../db.js';
import { syncModuleReadableText } from '../readable-text.js';
import { bindAutoSave } from '../autobind.js';
import { workspaceAutoSaveStatus } from '../save-status.js';
import {
  bindChileanRutInput,
  calcAge,
  copyToClipboard,
  escapeHtml,
  formatChileanRut,
  parseJsonSafe,
} from '../utils.js';

export async function renderRegistroInicial(host, moduleRow, { treatment }) {
  const data = parseJsonSafe(moduleRow.data);
  const age = calcAge(data.birth_date);
  const generoInit = data.genero || 'femenino';

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
          <div style="display:flex;align-items:center;gap:8px">
            <input type="date" name="birth_date" value="${escapeHtml(data.birth_date || '')}" style="flex:1" />
            <span id="age-display" style="color:var(--text-muted);font-size:0.85rem">${age != null ? `(${age} años)` : ''}</span>
          </div>
        </div>
        <div class="form-group">
          <label>Correo electrónico</label>
          <div style="display:flex;gap:8px">
            <input name="email" type="email" value="${escapeHtml(data.email || '')}" style="flex:1" />
            <button type="button" class="btn btn-secondary" id="btn-copy-email" title="Copiar" data-no-autobind>⎘</button>
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
        <div class="form-group" style="grid-column:1/-1">
          <label>Dirección</label>
          <input name="address" id="registro-address" placeholder="Ej. Copiapó, Atacama, Chile" value="${escapeHtml(data.address || '')}" />
        </div>
        <div class="form-group" style="grid-column:1/-1" data-no-autobind>
          <label>Ocupaciones</label>
          <div class="tags-input" id="occupations-tags"></div>
          <input type="text" id="occupation-input" placeholder="Escribir y Enter" style="margin-top:8px;width:100%" />
        </div>
      </form>
    </div>`;

  let genero = generoInit;
  let occupations = Array.isArray(data.occupations) ? [...data.occupations] : [];

  const persist = async () => {
    const form = host.querySelector('#form-registro');
    const fd = new FormData(form);
    const payload = {
      nombre: fd.get('nombre'),
      id_number: fd.get('id_number'),
      email: fd.get('email'),
      phone: fd.get('phone'),
      address: fd.get('address'),
      genero,
      birth_date: fd.get('birth_date'),
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

  const tagsEl = host.querySelector('#occupations-tags');
  const renderTags = () => {
    tagsEl.innerHTML = occupations
      .map(
        (o, i) =>
          `<span class="tag">${escapeHtml(o)} <button type="button" data-i="${i}" style="border:none;background:none;cursor:pointer">×</button></span>`,
      )
      .join('');
    tagsEl.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => {
        occupations.splice(Number(b.dataset.i), 1);
        renderTags();
        persist();
      });
    });
  };
  renderTags();

  host.querySelector('#occupation-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      e.preventDefault();
      occupations.push(e.target.value.trim());
      e.target.value = '';
      renderTags();
      persist();
    }
  });

  host.querySelectorAll('[data-field="genero"] button').forEach((btn) => {
    btn.addEventListener('click', () => {
      genero = btn.dataset.val;
      host.querySelectorAll('[data-field="genero"] button').forEach((b) => b.classList.toggle('active', b === btn));
      persist();
    });
  });

  host.querySelector('[name="birth_date"]')?.addEventListener('change', (e) => {
    const a = calcAge(e.target.value);
    host.querySelector('#age-display').textContent = a != null ? `(${a} años)` : '';
  });

  host.querySelector('#btn-copy-email')?.addEventListener('click', () => {
    const email = host.querySelector('[name="email"]').value;
    if (email) copyToClipboard(email);
  });

  bindChileanRutInput(host.querySelector('#registro-rut'));
  bindAddressAutocomplete(host.querySelector('#registro-address'), { onSelect: persist });

  bindAutoSave(host.querySelector('#form-registro'), persist, workspaceAutoSaveStatus());
}
