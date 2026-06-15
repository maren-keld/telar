import { escapeHtml, toast } from '../utils.js';

const STORAGE_PREFIX = 'telar.refDocs.';

function loadDocs(treatmentId) {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${treatmentId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveDocs(treatmentId, docs) {
  localStorage.setItem(`${STORAGE_PREFIX}${treatmentId}`, JSON.stringify(docs));
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderList(root, treatmentId) {
  const listEl = root.querySelector('#ref-docs-list');
  const docs = loadDocs(treatmentId);
  if (!docs.length) {
    listEl.innerHTML = `<p class="ref-docs-empty">Sin documentos adjuntos. Arrastra archivos o usa «Añadir archivo».</p>`;
    return;
  }
  listEl.innerHTML = docs
    .map(
      (d) => `
    <div class="ref-docs-item" data-id="${escapeHtml(d.id)}">
      <span class="ref-docs-item__icon" aria-hidden="true">📄</span>
      <span class="ref-docs-item__meta">
        <strong>${escapeHtml(d.name)}</strong>
        <small>${escapeHtml(formatSize(d.size))} · ${escapeHtml(d.addedAt.slice(0, 10))}</small>
      </span>
      <button type="button" class="btn btn-ghost btn-sm ref-docs-item__remove" data-remove="${escapeHtml(d.id)}" aria-label="Quitar">×</button>
    </div>`,
    )
    .join('');

  listEl.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.remove;
      const next = loadDocs(treatmentId).filter((d) => d.id !== id);
      saveDocs(treatmentId, next);
      renderList(root, treatmentId);
      toast('Documento quitado');
    });
  });
}

async function addFiles(treatmentId, files, root) {
  const docs = loadDocs(treatmentId);
  const maxBytes = 512 * 1024;

  for (const file of files) {
    if (file.size > maxBytes) {
      toast(`«${file.name}» supera 512 KB — usa un extracto o PDF más liviano`);
      continue;
    }
    docs.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      size: file.size,
      mime: file.type || 'application/octet-stream',
      addedAt: new Date().toISOString(),
    });
  }

  saveDocs(treatmentId, docs);
  renderList(root, treatmentId);
  if (files.length) toast('Documento(s) registrados en este tratamiento');
}

/** Modal reutilizable — rack de documentos de referencia por tratamiento (local). */
export function openReferenceDocumentsModal({ treatmentId }) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-backdrop" data-close>
      <div class="modal-card ref-docs-modal" role="dialog" aria-labelledby="ref-docs-title">
        <header class="ref-docs-modal__head">
          <h2 id="ref-docs-title" class="modal-card__title">Documentos de referencia</h2>
          <button type="button" class="modal-close" data-dismiss aria-label="Cerrar">×</button>
        </header>
        <p class="ref-docs-modal__hint">
          Adjunta guías, protocolos o material de apoyo. Se guardan solo en este dispositivo, asociados al tratamiento actual.
          En una versión futura alimentarán el contexto de la IA local.
        </p>
        <div class="ref-docs-dropzone" id="ref-docs-dropzone" tabindex="0">
          <p>Arrastra archivos aquí</p>
          <button type="button" class="btn btn-secondary btn-sm" id="ref-docs-pick">Añadir archivo</button>
          <input type="file" id="ref-docs-input" multiple hidden accept=".pdf,.txt,.md,.doc,.docx,image/*" />
        </div>
        <div id="ref-docs-list" class="ref-docs-list"></div>
        <div class="modal-card__actions">
          <button type="button" class="btn btn-primary" data-dismiss>Listo</button>
        </div>
      </div>
    </div>`;

  const close = () => {
    root.innerHTML = '';
  };

  root.querySelectorAll('[data-dismiss]').forEach((b) => b.addEventListener('click', close));
  root.querySelector('[data-close]')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) close();
  });

  renderList(root, treatmentId);

  const input = root.querySelector('#ref-docs-input');
  const drop = root.querySelector('#ref-docs-dropzone');

  root.querySelector('#ref-docs-pick')?.addEventListener('click', () => input?.click());
  input?.addEventListener('change', () => {
    if (input.files?.length) void addFiles(treatmentId, [...input.files], root);
    input.value = '';
  });

  drop?.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('ref-docs-dropzone--over');
  });
  drop?.addEventListener('dragleave', () => drop.classList.remove('ref-docs-dropzone--over'));
  drop?.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('ref-docs-dropzone--over');
    if (e.dataTransfer?.files?.length) void addFiles(treatmentId, [...e.dataTransfer.files], root);
  });
}

export function listReferenceDocuments(treatmentId) {
  return loadDocs(treatmentId);
}
