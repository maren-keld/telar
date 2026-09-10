import { getModuleDefs } from '../config.js';
import { isLicensePendingModule } from '../license-pending-modules.js';
import { CUSTOM_CATEGORY_BLURB, CUSTOM_CATEGORY_LABEL } from '../module-categories.js';
import { renderAppSidebar, bindAppSidebar } from '../components/app-sidebar.js';
import { requireProOrSubscribe } from '../components/subscribe-pro-modal.js';
import { openConfirmModal } from '../components/confirm-modal.js';
import {
  deleteCustomModule,
  deleteCustomModulePack,
  getCustomModule,
  listCustomModulePacks,
  listCustomModules,
  parseCustomModuleType,
  resolveModuleDef,
} from '../custom-modules.js';
import { exportPackToPath, installPackFromPath, isPackExportable, modulesOfPack } from '../pack-import.js';
import { escapeHtml, invokeErrorMessage, toast } from '../utils.js';
import { openExternalUrl, pickPackFile, pickPackSavePath } from '../tauri-bridge.js';
import { ICON_CART, ICON_UPLOAD } from '../icons.js';

function moduleTile(type, def, { kind = '', deletable = false } = {}) {
  const isCustom = type.startsWith('custom_');
  const customId = deletable ? parseCustomModuleType(type) : null;
  const badge =
    kind === 'interactive'
      ? '<span class="badge badge--info">Interactiva</span>'
      : isCustom
        ? '<span class="badge badge--info">Personalizado</span>'
        : '';
  const parts = (def.label || '').split(' — ');
  const displayName = parts[0];
  const categoryTag = parts[1]
    ? `<span class="badge badge--subtle">${escapeHtml(parts[1])}</span>`
    : '';
  const del = customId
    ? `<button type="button" class="module-tile__delete" data-delete-custom="${escapeHtml(customId)}" aria-label="Quitar de la librería" title="Quitar de la librería">×</button>`
    : '';
  return `
    <article class="module-tile${isCustom ? ' module-tile--custom' : ''}${customId ? ' module-tile--deletable' : ''}" data-type="${escapeHtml(type)}">
      ${del}
      <h3 class="module-tile__title">${escapeHtml(displayName)} ${categoryTag}</h3>
      <p class="module-tile__desc">${escapeHtml(def.description || 'Módulo clínico.')}</p>
      ${badge}
    </article>`;
}

function customTiles(mods, { deletable = false } = {}) {
  return mods
    .map((cm) => {
      const type = `custom_${cm.id}`;
      const def = resolveModuleDef(type) || { label: cm.title, description: cm.instructions || '' };
      return moduleTile(type, def, { kind: cm.kind, deletable });
    })
    .join('');
}

const LIB_SCROLL_KEY = 'telar.modulesLibrary.scrollTop';

export async function renderModulesLibrary(container, { onNavigate }) {
  const allCustom = listCustomModules();
  const ownMods = allCustom.filter((cm) => !cm.packId && cm.exportable !== false);
  const packs = listCustomModulePacks();
  const builtins = Object.entries(getModuleDefs()).filter(
    ([t]) => t !== 'selector_modulo' && !isLicensePendingModule(t),
  );

  const rerender = () => renderModulesLibrary(container, { onNavigate });

  container.innerHTML = `
    ${renderAppSidebar('modules')}
    <div class="app-main">
      <div class="app-content modules-library-page">
        <div class="modules-library-head">
          <div>
            <h1 class="modules-library-page__title">Módulos</h1>
            <p class="modules-library-page__sub">Todos los módulos disponibles en tu app.</p>
          </div>
          <div class="modules-library-head__actions">
            <button type="button" class="btn btn-secondary" id="btn-buy-modules">${ICON_CART}Comprar módulos</button>
            <button type="button" class="btn btn-secondary" id="btn-import-pack">${ICON_UPLOAD}Importar pack</button>
            <button type="button" class="btn btn-primary" id="btn-create-module-lib">+ Crear módulo</button>
          </div>
        </div>
        <section class="modules-library-section">
          <h2 class="modules-library-section__title">Módulos integrados</h2>
          <div class="modules-library-grid">
            ${builtins.map(([type, def]) => moduleTile(type, def)).join('')}
          </div>
        </section>
        ${
          ownMods.length
            ? `<section class="modules-library-section">
          <h2 class="modules-library-section__title">${CUSTOM_CATEGORY_LABEL}</h2>
          <p class="modules-library-section__blurb">${CUSTOM_CATEGORY_BLURB}</p>
          <div class="modules-library-head__actions modules-library-section__actions">
            <button type="button" class="btn btn-ghost btn-sm" data-export-own>Exportar como pack</button>
          </div>
          <div class="modules-library-grid">${customTiles(ownMods, { deletable: true })}</div>
        </section>`
            : ''
        }
        ${packs
          .map(
            (pack) => `<section class="modules-library-section" data-pack="${escapeHtml(pack.id)}">
          <h2 class="modules-library-section__title">${escapeHtml(pack.label)}</h2>
          <p class="modules-library-section__blurb">Pack importado · ${pack.modules.length} ${pack.modules.length === 1 ? 'módulo' : 'módulos'}.</p>
          <div class="modules-library-head__actions modules-library-section__actions">
            ${isPackExportable(pack.id) && pack.modules.some((mod) => mod.exportable !== false) ? `<button type="button" class="btn btn-ghost btn-sm" data-export-pack="${escapeHtml(pack.id)}">Exportar</button>` : ''}
            <button type="button" class="btn btn-ghost btn-sm" data-remove-pack="${escapeHtml(pack.id)}">Quitar pack</button>
          </div>
          <div class="modules-library-grid">${customTiles(pack.modules, { deletable: true })}</div>
        </section>`,
          )
          .join('')}
      </div>
    </div>`;

  bindAppSidebar(container, { onNavigate });

  container.querySelectorAll('.module-tile').forEach((tile) => {
    tile.addEventListener('mousedown', (e) => {
      if (e.button === 0 && !e.target.closest('[data-delete-custom]')) e.preventDefault();
    });
  });

  const scroller = container.querySelector('.app-content');
  if (scroller) {
    const saved = Number(sessionStorage.getItem(LIB_SCROLL_KEY) || '0');
    if (saved > 0) {
      scroller.scrollTop = saved;
      requestAnimationFrame(() => {
        if (scroller.isConnected) scroller.scrollTop = saved;
      });
    }
    scroller.addEventListener(
      'scroll',
      () => {
        sessionStorage.setItem(LIB_SCROLL_KEY, String(scroller.scrollTop));
      },
      { passive: true },
    );
  }

  container.querySelector('#btn-create-module-lib')?.addEventListener('click', () => {
    requireProOrSubscribe({
      onAllowed: () =>
        onNavigate({
          view: 'module-editor',
          customModuleId: '',
          returnView: 'modules',
          treatmentId: '',
          sessionId: '',
          moduleId: '',
        }),
    });
  });

  container.querySelector('#btn-buy-modules')?.addEventListener('click', () => {
    requireProOrSubscribe({
      onAllowed: () => openExternalUrl('https://telarapp.cl/modules'),
    });
  });

  container.querySelector('#btn-import-pack')?.addEventListener('click', () => {
    requireProOrSubscribe({
      onAllowed: async () => {
        try {
          const path = await pickPackFile();
          if (!path) return;
          const { pack, modules, warnings } = await installPackFromPath(path);
          toast(`«${pack.label}»: ${modules.length} ${modules.length === 1 ? 'módulo' : 'módulos'} importados`);
          if (warnings.length) console.warn('Pack importado con avisos:', warnings);
          await rerender();
          if (warnings.length) toast(warnings[0]);
        } catch (err) {
          console.error(err);
          toast(invokeErrorMessage(err, 'No se pudo importar el pack'));
        }
      },
    });
  });

  container.querySelector('[data-export-own]')?.addEventListener('click', async () => {
    try {
      const path = await pickPackSavePath('mis-modulos.telarpack');
      if (!path) return;
      await exportPackToPath(path, ownMods, { id: 'mis-modulos', label: 'Mis módulos' });
      toast('Pack exportado');
    } catch (err) {
      console.error(err);
      toast(invokeErrorMessage(err, 'No se pudo exportar el pack'));
    }
  });

  container.querySelectorAll('[data-export-pack]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const packId = btn.dataset.exportPack;
      const mods = modulesOfPack(packId);
      try {
        const path = await pickPackSavePath(`${packId}.telarpack`);
        if (!path) return;
        await exportPackToPath(path, mods, { id: packId, label: mods[0]?.packLabel || packId });
        toast('Pack exportado');
      } catch (err) {
        console.error(err);
        toast(invokeErrorMessage(err, 'No se pudo exportar el pack'));
      }
    });
  });

  container.querySelectorAll('[data-remove-pack]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const packId = btn.dataset.removePack;
      if (!confirm('Se quitan los módulos de este pack de tu librería. Las respuestas ya guardadas en las fichas se mantienen. ¿Continuar?')) {
        return;
      }
      await deleteCustomModulePack(packId);
      toast('Pack quitado');
      await rerender();
    });
  });

  container.querySelectorAll('[data-delete-custom]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.dataset.deleteCustom;
      const mod = id ? getCustomModule(id) : null;
      if (!mod) return;
      const ok = await openConfirmModal({
        title: '¿Quitar módulo?',
        message: `Se quita «${mod.title || 'este módulo'}» de tu librería. Las respuestas ya guardadas en las fichas se mantienen.`,
        confirmLabel: 'Quitar',
      });
      if (!ok) return;
      await deleteCustomModule(id);
      toast('Módulo quitado de la librería');
      await rerender();
    });
  });

  container.querySelectorAll('.module-tile--custom').forEach((tile) => {
    tile.addEventListener('mousedown', (e) => {
      if (e.button === 0 && !e.target.closest('[data-delete-custom]')) e.preventDefault();
    });
    tile.addEventListener('click', () => {
      const customId = parseCustomModuleType(tile.dataset.type);
      const mod = customId ? getCustomModule(customId) : null;
      if (!mod) return;
      // Los módulos de un pack son material de terceros: no se editan acá.
      if (mod.packId) {
        toast('Los módulos de un pack importado no se editan; se usan tal como vienen.');
        return;
      }
      const scroller = container.querySelector('.app-content');
      if (scroller) sessionStorage.setItem(LIB_SCROLL_KEY, String(scroller.scrollTop));
      onNavigate({
        view: 'module-editor',
        customModuleId: mod.id,
        returnView: 'modules',
        treatmentId: '',
        sessionId: '',
        moduleId: '',
      });
    });
  });
}
