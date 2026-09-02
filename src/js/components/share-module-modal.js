/**
 * «Enviar al paciente»: genera el enlace del módulo, lo copia y muestra el
 * estado del envío (esperando respuesta / anular).
 */
import { escapeHtml, parseJsonSafe, toast } from '../utils.js';
import { getModule } from '../db.js';
import {
  collectShareResponse,
  createModuleShareLink,
  revokeModuleShare,
  shareUrl,
} from '../share-sync.js';

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long' });
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {object} moduleRow Fila de `session_modules`.
 * @param {{ label: string, def?: object, interactive?: object, onChange?: Function }} opts
 */
export function openShareModuleModal(moduleRow, { label, def, interactive, onChange } = {}) {
  const root = document.getElementById('modal-root');

  const paint = (state) => {
    const share = state.share;
    const url = share ? shareUrl(share) : '';
    root.innerHTML = `
      <div class="modal-backdrop" data-close>
        <div class="modal-card share-modal" role="dialog" aria-labelledby="share-title">
          <h2 id="share-title" class="modal-card__title">Enviar al paciente</h2>
          <p class="share-modal__sub">${escapeHtml(label || 'Módulo')}</p>

          ${
            share
              ? `<div class="share-modal__link">
                  <input type="text" class="input" id="share-url" readonly value="${escapeHtml(url)}" />
                  <button type="button" class="btn btn-secondary" data-copy>Copiar</button>
                </div>
                <p class="share-modal__hint">
                  Mándaselo por WhatsApp o correo. Se puede responder una sola vez y caduca
                  ${share.expiresAt ? `el ${escapeHtml(fmtDate(share.expiresAt))}` : 'en 30 días'}.
                  Las respuestas llegan solas a este módulo.
                </p>
                <p class="share-modal__hint share-modal__hint--warn">
                  El enlace completo es la llave: si lo cortas, el paciente no podrá abrirlo.
                </p>`
              : `<p class="share-modal__hint">
                  Se crea un enlace con el cuestionario cifrado. Ni Telar ni el servidor pueden
                  leer lo que responde el paciente: la llave viaja solo dentro del enlace.
                </p>`
          }

          <div class="modal-card__actions">
            ${share ? '<button type="button" class="btn btn-danger" data-revoke>Anular enlace</button>' : ''}
            ${share ? '<button type="button" class="btn btn-secondary" data-check>Revisar respuesta</button>' : ''}
            ${share ? '' : '<button type="button" class="btn btn-secondary" data-cancel>Cancelar</button>'}
            ${share ? '<button type="button" class="btn btn-primary" data-cancel>Listo</button>' : '<button type="button" class="btn btn-primary" data-create>Crear enlace y copiar</button>'}
          </div>
        </div>
      </div>`;

    const close = () => {
      root.innerHTML = '';
    };

    root.querySelector('[data-cancel]')?.addEventListener('click', close);
    root.querySelector('[data-close]')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) close();
    });

    root.querySelector('[data-copy]')?.addEventListener('click', async () => {
      const ok = await copy(url);
      if (ok) toast('Enlace copiado');
      else root.querySelector('#share-url')?.select();
    });

    root.querySelector('[data-create]')?.addEventListener('click', async (event) => {
      const btn = event.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Creando…';
      try {
        const created = await createModuleShareLink(moduleRow, { def, interactive });
        await copy(created.url);
        toast('Enlace creado y copiado');
        const fresh = await getModule(moduleRow.id);
        onChange?.();
        paint({ share: parseJsonSafe(fresh?.data, {}).share });
      } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Crear enlace y copiar';
        toast(e.message || 'No se pudo crear el enlace');
      }
    });

    root.querySelector('[data-check]')?.addEventListener('click', async (event) => {
      const btn = event.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Revisando…';
      const fresh = await getModule(moduleRow.id);
      const applied = await collectShareResponse(fresh || moduleRow);
      if (applied) {
        toast('Respuesta recibida');
        close();
        onChange?.();
        return;
      }
      btn.disabled = false;
      btn.textContent = 'Revisar respuesta';
      toast('Todavía no responde');
    });

    root.querySelector('[data-revoke]')?.addEventListener('click', async () => {
      const fresh = await getModule(moduleRow.id);
      await revokeModuleShare(fresh || moduleRow);
      toast('Enlace anulado');
      onChange?.();
      paint({ share: null });
    });
  };

  paint({ share: parseJsonSafe(moduleRow.data, {}).share });
}
