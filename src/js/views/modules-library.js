import { MODULE_DEFS } from '../config.js';
import { renderAppSidebar, bindAppSidebar } from '../components/app-sidebar.js';
import { openCreateModuleModal } from '../components/create-module-modal.js';
import { requireProOrSubscribe } from '../components/subscribe-pro-modal.js';
import { getCustomModule, listCustomModules, parseCustomModuleType, resolveModuleDef } from '../custom-modules.js';
import { escapeHtml } from '../utils.js';
import { openExternalUrl } from '../tauri-bridge.js';

function moduleTile(type, def) {
  const isCustom = type.startsWith('custom_');
  return `
    <article class="module-tile${isCustom ? ' module-tile--custom' : ''}" data-type="${escapeHtml(type)}">
      <h3 class="module-tile__title">${escapeHtml(def.label)}</h3>
      <p class="module-tile__desc">${escapeHtml(def.description || 'Módulo clínico.')}</p>
      ${isCustom ? '<span class="badge badge--info">Personalizado</span>' : ''}
    </article>`;
}

export async function renderModulesLibrary(container, { onNavigate }) {
  const customMods = listCustomModules();
  const builtins = Object.entries(MODULE_DEFS).filter(([t]) => t !== 'selector_modulo');

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
          customMods.length
            ? `<section class="modules-library-section">
          <h2 class="modules-library-section__title">Mis módulos</h2>
          <div class="modules-library-grid">
            ${customMods
              .map((cm) => {
                const type = `custom_${cm.id}`;
                const def = resolveModuleDef(type) || { label: cm.title, description: cm.instructions || '' };
                return moduleTile(type, def);
              })
              .join('')}
          </div>
        </section>`
            : ''
        }
      </div>
    </div>`;

  bindAppSidebar(container, { onNavigate });

  container.querySelector('#btn-create-module-lib')?.addEventListener('click', () => {
    openCreateModuleModal({
      onCreated: () => renderModulesLibrary(container, { onNavigate }),
    });
  });

  container.querySelector('#btn-buy-modules')?.addEventListener('click', () => {
    requireProOrSubscribe({
      onAllowed: () => openExternalUrl('https://telarapp.cl/modules'),
    });
  });

  container.querySelectorAll('.module-tile--custom').forEach((tile) => {
    tile.addEventListener('click', () => {
      const customId = parseCustomModuleType(tile.dataset.type);
      const mod = customId ? getCustomModule(customId) : null;
      if (!mod) return;
      openCreateModuleModal({
        module: mod,
        onCreated: () => renderModulesLibrary(container, { onNavigate }),
      });
    });
  });
}
