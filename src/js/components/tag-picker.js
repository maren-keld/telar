import { TAG_COLOR_PRESETS } from '../config.js';
import { addCustomTag, allTagEntries } from '../custom-tags.js';
import { updateTreatmentTags } from '../db.js';
import { escapeHtml, parseJsonSafe } from '../utils.js';

function selectedSet(row) {
  const tags = Array.isArray(row.tags) ? [...row.tags] : parseJsonSafe(row.tags, []);
  return new Set(tags);
}

function tagIsOn(row, selected, key) {
  return selected.has(key) || (key === 'alerta' && row.clinical_alert);
}

function positionPicker(picker, anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const width = 252;
  let left = rect.left;
  if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
  const estH = Math.min(340, window.innerHeight - 24);
  let top = rect.bottom + 6;
  if (top + estH > window.innerHeight - 8) {
    top = Math.max(8, rect.top - estH - 6);
  }
  picker.style.top = `${top}px`;
  picker.style.left = `${left}px`;
}

export async function openTagPicker(anchorEl, row, { onChange } = {}) {
  const root = document.getElementById('modal-root');
  if (!root) return;
  const selected = selectedSet(row);
  let query = '';
  let mode = 'list';
  let pendingLabel = '';

  const close = () => {
    root.innerHTML = '';
  };

  const persist = async () => {
    const tags = [...selected];
    await updateTreatmentTags(row.treatment_id, tags);
    row.tags = tags;
    onChange?.(tags);
  };

  const toggle = async (key) => {
    if (selected.has(key)) selected.delete(key);
    else selected.add(key);
    await persist();
    paintList();
  };

  root.innerHTML = `
    <div class="dropdown-backdrop" id="tag-picker-backdrop">
      <div class="dropdown-menu tag-picker t-dropdown" data-origin="top-left" role="dialog" aria-label="Etiquetas"></div>
    </div>`;

  const picker = root.querySelector('.tag-picker');
  positionPicker(picker, anchorEl);

  root.querySelector('#tag-picker-backdrop')?.addEventListener('click', (e) => {
    if (e.target.id === 'tag-picker-backdrop') close();
  });

  const paintList = () => {
    const q = query.trim().toLowerCase();
    const entries = allTagEntries().filter(([, v]) => !q || v.label.toLowerCase().includes(q));
    const exact = allTagEntries().some(([, v]) => v.label.toLowerCase() === q);
    const canCreate = q.length > 0 && !exact;

    picker.innerHTML = `
      <input class="tag-picker__search" type="text" placeholder="Añadir o buscar etiqueta…" value="${escapeHtml(query)}" autocomplete="off" />
      <div class="tag-picker__list">
        ${
          entries
            .map(([k, v]) => {
              const on = tagIsOn(row, selected, k);
              return `<button type="button" class="tag-picker__row${on ? ' is-on' : ''}" data-tag="${escapeHtml(k)}">
                <span class="tag-picker__check" aria-hidden="true">${on ? '✓' : ''}</span>
                <span class="patient-card__tag-dot" style="--tag-color:${escapeHtml(v.color || '#64748b')}"></span>
                <span>${escapeHtml(v.label)}</span>
              </button>`;
            })
            .join('') || `<p class="tag-picker__empty">Sin coincidencias</p>`
        }
        ${
          canCreate
            ? `<button type="button" class="tag-picker__row tag-picker__row--create is-on" data-create>
                <span class="tag-picker__plus" aria-hidden="true">+</span>
                <span>Crear etiqueta: “${escapeHtml(query.trim())}”</span>
              </button>`
            : ''
        }
      </div>`;

    const input = picker.querySelector('.tag-picker__search');
    input?.focus();
    if (input) {
      input.value = query;
      try {
        input.setSelectionRange(query.length, query.length);
      } catch {
        /* search inputs may ignore selection */
      }
    }
    input?.addEventListener('input', (e) => {
      query = e.target.value;
      paintList();
    });
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (canCreate) {
          pendingLabel = query.trim();
          mode = 'color';
          paintColors();
        } else if (entries.length === 1) {
          void toggle(entries[0][0]);
        }
      }
    });
    picker.querySelectorAll('[data-tag]').forEach((btn) => {
      btn.addEventListener('click', () => void toggle(btn.dataset.tag));
    });
    picker.querySelector('[data-create]')?.addEventListener('click', () => {
      pendingLabel = query.trim();
      mode = 'color';
      paintColors();
    });
  };

  const paintColors = () => {
    picker.innerHTML = `
      <div class="tag-picker__create-head">
        <span class="tag-picker__create-kicker">Crear</span>
        <span class="patient-card__tag">
          <span class="patient-card__tag-dot" style="--tag-color:${TAG_COLOR_PRESETS[1].hex}"></span>
          <span>${escapeHtml(pendingLabel)}</span>
        </span>
      </div>
      <p class="tag-picker__section">Elige un color</p>
      <div class="tag-picker__list">
        ${TAG_COLOR_PRESETS.map(
          (c) => `<button type="button" class="tag-picker__row" data-color="${escapeHtml(c.hex)}">
            <span class="patient-card__tag-dot" style="--tag-color:${escapeHtml(c.hex)}"></span>
            <span>${escapeHtml(c.label)}</span>
          </button>`,
        ).join('')}
      </div>`;

    picker.querySelectorAll('[data-color]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const created = addCustomTag({ label: pendingLabel, color: btn.dataset.color });
        if (created?.id) selected.add(created.id);
        await persist();
        query = '';
        mode = 'list';
        paintList();
      });
      btn.addEventListener('mouseenter', () => {
        const preview = picker.querySelector('.tag-picker__create-head .patient-card__tag-dot');
        if (preview) preview.style.setProperty('--tag-color', btn.dataset.color);
      });
    });
  };

  if (mode === 'color') paintColors();
  else paintList();
}
