import { getModuleDefs } from '../config.js';
import { isLicensePendingModule } from '../license-pending-modules.js';
import { CUSTOM_CATEGORY_BLURB, CUSTOM_CATEGORY_LABEL } from '../module-categories.js';
import { renderAppSidebar, bindAppSidebar } from '../components/app-sidebar.js';
import { openCreateModuleModal } from '../components/create-module-modal.js';
import { openModuleAiChat } from '../components/module-ai-chat.js';
import { requireProOrSubscribe } from '../components/subscribe-pro-modal.js';
import {
  deleteCustomModulePack,
  getCustomModule,
  listCustomModulePacks,
  listCustomModules,
  parseCustomModuleType,
  resolveModuleDef,
} from '../custom-modules.js';
import { exportPackToPath, installPackFromPath, modulesOfPack } from '../pack-import.js';
import { escapeHtml, invokeErrorMessage, toast } from '../utils.js';
import { openExternalUrl, pickPackFile, pickPackSavePath } from '../tauri-bridge.js';

function moduleTile(type, def, { kind = '' } = {}) {
  const isCustom = type.startsWith('custom_');
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
  return `
    <article class="module-tile${isCustom ? ' module-tile--custom' : ''}" data-type="${escapeHtml(type)}">
      <h3 class="module-tile__title">${escapeHtml(displayName)} ${categoryTag}</h3>
      <p class="module-tile__desc">${escapeHtml(def.description || 'Módulo clínico.')}</p>
      ${badge}
    </article>`;
}

function customTiles(mods) {
  return mods
    .map((cm) => {
      const type = `custom_${cm.id}`;
      const def = resolveModuleDef(type) || { label: cm.title, description: cm.instructions || '' };
      return moduleTile(type, def, { kind: cm.kind });
    })
    .join('');
}

export async function renderModulesLibrary(container, { onNavigate }) {
  const allCustom = listCustomModules();
  const ownMods = allCustom.filter((cm) => !cm.packId);
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
            <button type="button" class="btn btn-secondary" id="btn-buy-modules">Comprar módulos</button>
            <button type="button" class="btn btn-secondary" id="btn-import-pack">Importar pack</button>
            <button type="button" class="btn btn-secondary" id="btn-ai-module">Crear con IA</button>
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
          <div class="modules-library-grid">${customTiles(ownMods)}</div>
        </section>`
            : ''
        }
        ${packs
          .map(
            (pack) => `<section class="modules-library-section" data-pack="${escapeHtml(pack.id)}">
          <h2 class="modules-library-section__title">${escapeHtml(pack.label)}</h2>
          <p class="modules-library-section__blurb">Pack importado · ${pack.modules.length} ${pack.modules.length === 1 ? 'módulo' : 'módulos'}.</p>
          <div class="modules-library-head__actions modules-library-section__actions">
            <button type="button" class="btn btn-ghost btn-sm" data-export-pack="${escapeHtml(pack.id)}">Exportar</button>
            <button type="button" class="btn btn-ghost btn-sm" data-remove-pack="${escapeHtml(pack.id)}">Quitar pack</button>
          </div>
          <div class="modules-library-grid">${customTiles(pack.modules)}</div>
        </section>`,
          )
          .join('')}
      </div>
    </div>`;

  bindAppSidebar(container, { onNavigate });

  container.querySelector('#btn-create-module-lib')?.addEventListener('click', () => {
    requireProOrSubscribe({
      onAllowed: () => openCreateModuleModal({ onCreated: rerender }),
    });
  });

  container.querySelector('#btn-ai-module')?.addEventListener('click', () => {
    requireProOrSubscribe({
      onAllowed: () => openModuleAiChat({ onCreated: rerender }),
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

  container.querySelectorAll('.module-tile--custom').forEach((tile) => {
    tile.addEventListener('click', () => {
      const customId = parseCustomModuleType(tile.dataset.type);
      const mod = customId ? getCustomModule(customId) : null;
      if (!mod) return;
      // Los módulos de un pack son material de terceros: no se editan acá.
      if (mod.packId) {
        toast('Los módulos de un pack importado no se editan; se usan tal como vienen.');
        return;
      }
      openCreateModuleModal({ module: mod, onCreated: rerender });
    });
  });
}
