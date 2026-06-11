import { bindAutoSave, collectFormData } from '../autobind.js';
import { openConfirmModal } from '../components/confirm-modal.js';
import { syncModuleReadableText } from '../readable-text.js';
import { escapeHtml, parseJsonSafe, toast } from '../utils.js';
import { workspaceAutoSaveStatus } from '../save-status.js';

const AFFILIATIONS = [
  'Madre',
  'Padre',
  'Hijo/a',
  'Hija',
  'Hermano/a',
  'Abuelo/a',
  'Abuela',
  'Pareja',
  'Cónyuge',
  'Tío/a',
  'Primo/a',
  'Amigo/a',
  'Otro',
];
const DOMAINS = ['Armonía', 'Conflicto', 'Apoyo emocional', 'Apoyo práctico', 'Contacto limitado'];

export async function renderRedesApoyo(host, moduleRow) {
  const data = parseJsonSafe(moduleRow.data, {});
  const people = Array.isArray(data.people) ? data.people : [];
  const view = data.view === 'genograma' ? 'genograma' : 'lista';

  host.innerHTML = `
    <div class="card support-module">
      <div class="support-module__head">
        <h2 class="module-title" style="margin:0">Redes de apoyo</h2>
        <button type="button" class="btn btn-ghost" id="btn-add-person" title="Añadir persona">+ Añadir persona</button>
      </div>

      <div class="support-view-tabs" data-no-autobind>
        <button type="button" class="support-view-tab ${view === 'lista' ? 'active' : ''}" data-view="lista">Lista</button>
        <button type="button" class="support-view-tab ${view === 'genograma' ? 'active' : ''}" data-view="genograma">Genograma</button>
      </div>

      <form id="support-form" class="support-form">
        <input type="hidden" name="view" value="${escapeHtml(view)}" />
        <div class="support-panel support-panel--lista" id="support-lista" ${view === 'lista' ? '' : 'hidden'}>
          <p class="support-empty" id="support-empty" ${people.length ? 'hidden' : ''}>Sin personas aún.</p>
          <div class="support-list" id="support-list">
            ${people.map((p, i) => personBlockHtml(p, i)).join('')}
          </div>
        </div>
        <div class="support-panel support-panel--genograma" id="support-genograma" ${view === 'genograma' ? '' : 'hidden'}>
          ${genogramHtml(people)}
        </div>
      </form>
    </div>
  `;

  const form = host.querySelector('#support-form');
  const list = host.querySelector('#support-list');
  const emptyEl = host.querySelector('#support-empty');
  const listaPanel = host.querySelector('#support-lista');
  const genogramPanel = host.querySelector('#support-genograma');

  const collectPeople = () => {
    const fd = collectFormData(form);
    const next = [];
    for (let i = 0; i < 200; i++) {
      if (!(`p_${i}_name` in fd)) break;
      next.push({
        name: fd[`p_${i}_name`] || '',
        gender: fd[`p_${i}_gender`] || 'f',
        relation: fd[`p_${i}_relation`] || 'Otro',
        domain: fd[`p_${i}_domain`] || 'Armonía',
        notes: fd[`p_${i}_notes`] || '',
      });
    }
    return next;
  };

  const refreshGenogram = () => {
    if (genogramPanel) genogramPanel.innerHTML = genogramHtml(collectPeople());
  };

  const persist = async () => {
    const fd = collectFormData(form);
    const next = collectPeople();
    await syncModuleReadableText(moduleRow, { people: next, view: fd.view || 'lista' }, 'completado');
    syncEmptyState();
    refreshGenogram();
  };

  const syncEmptyState = () => {
    const count = list?.querySelectorAll('.support-person').length || 0;
    if (emptyEl) emptyEl.hidden = count > 0;
  };

  const reindexRows = () => {
    list.querySelectorAll('.support-person').forEach((block, i) => {
      block.querySelectorAll('[name]').forEach((el) => {
        const m = el.getAttribute('name')?.match(/^p_\d+_(.+)$/);
        if (m) el.setAttribute('name', `p_${i}_${m[1]}`);
      });
      const notesWrap = block.querySelector('.support-notes-wrap');
      if (notesWrap) {
        notesWrap.id = `support-notes-${i}`;
        const ta = notesWrap.querySelector('textarea');
        if (ta) ta.name = `p_${i}_notes`;
      }
    });
  };

  bindAutoSave(form, persist, workspaceAutoSaveStatus());

  host.querySelectorAll('.support-view-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.view;
      host.querySelectorAll('.support-view-tab').forEach((b) => b.classList.toggle('active', b === btn));
      form.querySelector('[name="view"]').value = v;
      listaPanel.hidden = v !== 'lista';
      genogramPanel.hidden = v !== 'genograma';
      persist();
    });
  });

  host.querySelector('#btn-add-person')?.addEventListener('click', () => {
    const i = list.querySelectorAll('.support-person').length;
    list.insertAdjacentHTML('beforeend', personBlockHtml({ name: '', gender: 'f', relation: 'Otro', domain: 'Armonía', notes: '' }, i));
    syncEmptyState();
    list.querySelector(`[name="p_${i}_name"]`)?.focus();
    bindPersonBlocks(list, persist, reindexRows, syncEmptyState);
    persist();
  });

  bindPersonBlocks(list, persist, reindexRows, syncEmptyState);
}

const GENO_TIERS = {
  'Abuelo/a': 0,
  Abuela: 0,
  Madre: 1,
  Padre: 1,
  'Tío/a': 1,
  'Hermano/a': 2,
  Pareja: 2,
  Cónyuge: 2,
  'Hijo/a': 3,
  Hija: 3,
  'Primo/a': 4,
  'Amigo/a': 4,
  Otro: 4,
};

function genogramTier(relation) {
  return GENO_TIERS[relation] ?? 4;
}

function layoutGenogramNodes(people) {
  const tiers = [[], [], [], [], []];
  people.forEach((p, i) => {
    tiers[genogramTier(p.relation || 'Otro')].push({ ...p, idx: i });
  });

  const W = 400;
  const H = 300;
  const rowY = [36, 96, 156, 216, 268];
  const placed = [];
  const byKey = {};

  tiers.forEach((row, tier) => {
    const count = row.length;
    const startX = W / 2 - ((count - 1) * 72) / 2;
    row.forEach((p, col) => {
      const x = count === 1 ? W / 2 : startX + col * 72;
      const y = rowY[tier];
      const key = `p${p.idx}`;
      placed.push({ ...p, x, y, key, tier });
      byKey[key] = { x, y, tier, relation: p.relation };
    });
  });

  const patient = { x: W / 2, y: rowY[2], key: 'patient', tier: 2, name: 'Paciente', gender: 'f', relation: 'Paciente' };
  return { placed, patient, byKey, W, H, rowY };
}

function genogramConnectors(placed, patient, byKey) {
  const lines = [];
  const marriage = (a, b) => {
    lines.push(`<line class="genogram-line genogram-line--union" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />`);
    lines.push(`<line class="genogram-line genogram-line--union" x1="${a.x}" y1="${a.y + 3}" x2="${b.x}" y2="${b.y + 3}" />`);
  };
  const childLink = (from, to) => {
    const midY = (from.y + to.y) / 2;
    lines.push(`<line class="genogram-line" x1="${from.x}" y1="${from.y}" x2="${from.x}" y2="${midY}" />`);
    lines.push(`<line class="genogram-line" x1="${from.x}" y1="${midY}" x2="${to.x}" y2="${midY}" />`);
    lines.push(`<line class="genogram-line" x1="${to.x}" y1="${midY}" x2="${to.x}" y2="${to.y}" />`);
  };

  const madre = placed.find((p) => p.relation === 'Madre');
  const padre = placed.find((p) => p.relation === 'Padre');
  const pareja = placed.find((p) => p.relation === 'Pareja' || p.relation === 'Cónyuge');
  const hijos = placed.filter((p) => p.relation === 'Hijo/a' || p.relation === 'Hija');
  const hermanos = placed.filter((p) => p.relation === 'Hermano/a');

  if (madre && padre) {
    marriage(madre, padre);
    const unionX = (madre.x + padre.x) / 2;
    const unionY = madre.y;
    lines.push(`<line class="genogram-line" x1="${unionX}" y1="${unionY}" x2="${unionX}" y2="${patient.y - 28}" />`);
    lines.push(`<line class="genogram-line" x1="${unionX}" y1="${patient.y - 28}" x2="${patient.x}" y2="${patient.y - 28}" />`);
    lines.push(`<line class="genogram-line" x1="${patient.x}" y1="${patient.y - 28}" x2="${patient.x}" y2="${patient.y - 18}" />`);
  } else if (madre || padre) {
    childLink(madre || padre, patient);
  }

  if (pareja) marriage(patient, pareja);

  if (hermanos.length && (madre || padre)) {
    const anchor = madre || padre;
    const xs = [patient.x, ...hermanos.map((h) => h.x)];
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const sibY = patient.y - 28;
    lines.push(`<line class="genogram-line" x1="${minX}" y1="${sibY}" x2="${maxX}" y2="${sibY}" />`);
    hermanos.forEach((h) => {
      lines.push(`<line class="genogram-line" x1="${h.x}" y1="${sibY}" x2="${h.x}" y2="${h.y - 18}" />`);
    });
  }

  hijos.forEach((h) => childLink(patient, h));

  placed
    .filter((p) => !['Madre', 'Padre', 'Pareja', 'Cónyuge', 'Hijo/a', 'Hija', 'Hermano/a'].includes(p.relation))
    .forEach((p) => childLink(patient, p));

  return lines.join('');
}

function genogramNodeHtml(node, { isPatient = false } = {}) {
  const gender = node.gender === 'm' ? 'm' : 'f';
  const label = (node.name || 'Sin nombre').trim().slice(0, 12);
  const aff = node.relation && node.relation !== 'Paciente' ? node.relation : '';
  return `
    <div class="genogram-node genogram-node--${gender}${isPatient ? ' genogram-node--patient' : ''}"
      style="left:${(node.x / 400) * 100}%;top:${(node.y / 300) * 100}%"
      title="${escapeHtml([aff, node.domain].filter(Boolean).join(' · '))}">
      <span class="genogram-node__symbol" aria-hidden="true">${gender === 'm' ? '□' : '○'}</span>
      <span class="genogram-node__name" data-sensitive>${escapeHtml(isPatient ? 'Paciente' : label)}</span>
      ${aff && !isPatient ? `<span class="genogram-node__aff">${escapeHtml(aff)}</span>` : ''}
    </div>`;
}

function genogramHtml(people) {
  if (!people.length) {
    return `<div class="genogram-canvas genogram-canvas--empty"><p class="text-muted">Añade personas en la vista Lista para ver el genograma.</p></div>`;
  }

  const { placed, patient, W, H } = layoutGenogramNodes(people);
  const connectors = genogramConnectors(placed, patient, {});

  return `
    <div class="genogram-canvas" role="img" aria-label="Genograma de redes de apoyo">
      <svg class="genogram-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
        ${connectors}
      </svg>
      ${genogramNodeHtml(patient, { isPatient: true })}
      ${placed.map((p) => genogramNodeHtml(p)).join('')}
    </div>`;
}

function bindPersonBlocks(list, persist, reindexRows, syncEmptyState) {
  list.querySelectorAll('.support-person').forEach((block) => {
    if (block.dataset.bound === '1') return;
    block.dataset.bound = '1';

    block.querySelectorAll('[data-gender]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const gender = btn.dataset.gender;
        block.querySelectorAll('[data-gender]').forEach((b) => b.classList.toggle('active', b === btn));
        block.querySelector('input[type="hidden"][name$="_gender"]').value = gender;
        persist();
      });
    });

    const noteBtn = block.querySelector('[data-toggle-notes]');
    const notesWrap = block.querySelector('.support-notes-wrap');
    if (noteBtn && notesWrap) {
      const hasNotes = Boolean(notesWrap.querySelector('textarea')?.value?.trim());
      noteBtn.classList.toggle('active', hasNotes || !notesWrap.hidden);
      noteBtn.addEventListener('click', () => {
        const open = notesWrap.hidden;
        notesWrap.hidden = !open;
        noteBtn.classList.toggle('active', open);
        if (open) notesWrap.querySelector('textarea')?.focus();
      });
    }

    block.querySelector('[data-delete]')?.addEventListener('click', async () => {
      const name = block.querySelector('[name$="_name"]')?.value?.trim();
      const ok = await openConfirmModal({
        title: '¿Eliminar persona?',
        message: name
          ? `¿Eliminar a «${name}» de la red de apoyo?`
          : '¿Eliminar esta persona de la red de apoyo?',
        confirmLabel: 'Eliminar',
      });
      if (!ok) return;
      block.remove();
      reindexRows();
      syncEmptyState();
      await persist();
      toast('Persona eliminada');
    });
  });
}

function personBlockHtml(p, i) {
  const gender = p.gender === 'm' ? 'm' : 'f';
  const hasNotes = Boolean((p.notes || '').trim());
  return `
    <div class="support-person">
      <div class="support-row">
        <input name="p_${i}_name" value="${escapeHtml(p.name || '')}" placeholder="Nombre" data-sensitive />
        <div class="support-gender" data-no-autobind>
          <button type="button" class="${gender === 'f' ? 'active' : ''}" data-gender="f" title="Femenino">♀</button>
          <button type="button" class="${gender === 'm' ? 'active' : ''}" data-gender="m" title="Masculino">♂</button>
          <input type="hidden" name="p_${i}_gender" value="${gender}" />
        </div>
        <select name="p_${i}_relation" title="Afiliación">
          ${AFFILIATIONS.map((t) => `<option value="${escapeHtml(t)}" ${p.relation === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
        </select>
        <select name="p_${i}_domain" title="Dominio / estado">
          ${DOMAINS.map((t) => `<option value="${escapeHtml(t)}" ${p.domain === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
        </select>
        <button type="button" class="btn btn-ghost support-note${hasNotes ? ' active' : ''}" data-toggle-notes title="Notas">✎</button>
        <button type="button" class="btn btn-ghost" data-delete title="Eliminar persona">×</button>
      </div>
      <div class="support-notes-wrap" id="support-notes-${i}" ${hasNotes ? '' : 'hidden'}>
        <textarea name="p_${i}_notes" rows="3" placeholder="Notas sobre esta persona…">${escapeHtml(p.notes || '')}</textarea>
      </div>
    </div>
  `;
}
