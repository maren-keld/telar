import { expect, test } from '@playwright/test';

/**
 * El índice lateral usa pointer events en vez de HTML5 drag & drop porque el
 * WebView de macOS se queda con el arrastre nativo. Este test monta el sidebar
 * mínimo, intercepta db.js y comprueba el reordenamiento real.
 */

const DB_STUB = `
const NO_MOVE = new Set(['registro_inicial', 'motivo_consulta', 'selector_modulo']);
window.__dndCalls = [];
export function canMoveModule(mod) {
  return Boolean(mod && !NO_MOVE.has(mod.module_type));
}
export async function getModule(id) {
  const el = document.querySelector('.module-link[data-module-id="' + id + '"]');
  return { id, module_type: el?.dataset.moduleType || 'gad7', session_id: el?.dataset.sessionId };
}
export async function moveModuleToPosition(moduleId, targetSessionId, insertIndex) {
  window.__dndCalls.push({ moduleId: String(moduleId), targetSessionId, insertIndex });
}
`;

const link = (sessionId, id, type, label, draggable) =>
  `<a href="#" class="module-link" data-session-id="${sessionId}" data-module-id="${id}"
      data-module-type="${type}" data-draggable="${draggable}">${label}</a>`;

const HARNESS = `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="/css/tokens.css">
<link rel="stylesheet" href="/css/modules.css">
<style>.workspace-sidebar__scroll{max-height:400px;overflow-y:auto;width:260px}
.session-block{margin-bottom:12px}
.session-block__title{display:block;width:100%;text-align:left}</style>
</head><body>
<aside class="workspace-sidebar" id="leftsidebar"><div class="workspace-sidebar__scroll">
  <section class="session-block" data-session-id="1">
    <button type="button" class="session-block__title" data-session-toggle>Sesión 1</button>
    <div class="session-block__body">
    <nav class="session-block__modules">
      ${link(1, 10, 'registro_inicial', 'Registro inicial', false)}
      ${link(1, 11, 'gad7', 'GAD-7', true)}
      ${link(1, 12, 'dass21', 'DASS-21', true)}
      ${link(1, 13, 'selector_modulo', 'Selector', false)}
    </nav></div></section>
  <section class="session-block" data-session-id="2">
    <button type="button" class="session-block__title" data-session-toggle>Sesión 2</button>
    <div class="session-block__body">
    <nav class="session-block__modules">
      ${link(2, 20, 'tcc_abc', 'Modelo ABC', true)}
      ${link(2, 21, 'selector_modulo', 'Selector', false)}
    </nav></div></section>
</div></aside>
<script type="module">
  import { bindWorkspaceModuleDnD } from '/js/components/workspace-dnd.js';
  window.__clicks = [];
  bindWorkspaceModuleDnD(document.body, {
    treatmentId: 1,
    activeModuleId: 11,
    onNavigate: () => {},
    onMoved: () => {},
  });
  document.querySelectorAll('.module-link').forEach((l) => {
    l.addEventListener('click', (e) => {
      e.preventDefault();
      window.__clicks.push(l.dataset.moduleId);
    });
  });
  window.__ready = true;
</script>
</body></html>`;

async function openHarness(page) {
  await page.route('**/js/db.js', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: DB_STUB }),
  );
  await page.route('**/dnd-harness', (route) =>
    route.fulfill({ contentType: 'text/html', body: HARNESS }),
  );
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/dnd-harness');
  await page.waitForFunction('window.__ready === true');
  return errors;
}

/** Arrastra un módulo sobre otro y suelta en su mitad superior o inferior. */
async function drag(page, fromId, toId, half) {
  const from = page.locator(`.module-link[data-module-id="${fromId}"]`);
  const to = page.locator(`.module-link[data-module-id="${toId}"]`);
  const a = await from.boundingBox();
  const b = await to.boundingBox();
  const y = half === 'after' ? b.y + b.height * 0.8 : b.y + b.height * 0.2;

  await page.mouse.move(a.x + 10, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + 24, a.y + a.height / 2 + 8, { steps: 3 });
  await page.mouse.move(b.x + 24, y, { steps: 5 });
  await page.mouse.up();
}

test('reordena un módulo dentro de la misma sesión', async ({ page }) => {
  const errors = await openHarness(page);
  await drag(page, 11, 12, 'after');

  expect(await page.evaluate('window.__dndCalls')).toEqual([
    { moduleId: '11', targetSessionId: 1, insertIndex: 2 },
  ]);
  expect(await page.evaluate('window.__clicks')).toEqual([]);
  expect(errors).toEqual([]);
});

test('mueve un módulo a otra sesión', async ({ page }) => {
  await openHarness(page);
  await drag(page, 12, 20, 'before');

  expect(await page.evaluate('window.__dndCalls')).toEqual([
    { moduleId: '12', targetSessionId: 2, insertIndex: 0 },
  ]);
});

test('un click simple sigue navegando al módulo', async ({ page }) => {
  await openHarness(page);
  await page.locator('.module-link[data-module-id="12"]').click();

  expect(await page.evaluate('window.__clicks')).toEqual(['12']);
  expect(await page.evaluate('window.__dndCalls')).toEqual([]);
});

test('los módulos estructurales no se arrastran', async ({ page }) => {
  await openHarness(page);
  await drag(page, 10, 12, 'after');

  expect(await page.evaluate('window.__dndCalls')).toEqual([]);
});

test('soltar sobre el título de otra sesión inserta al inicio, no al fondo', async ({ page }) => {
  await openHarness(page);
  const from = page.locator('.module-link[data-module-id="12"]');
  const title = page.locator('.session-block[data-session-id="2"] .session-block__title');
  const a = await from.boundingBox();
  const b = await title.boundingBox();

  await page.mouse.move(a.x + 10, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + 24, a.y + a.height / 2 + 8, { steps: 3 });
  await page.mouse.move(b.x + 24, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();

  expect(await page.evaluate('window.__dndCalls')).toEqual([
    { moduleId: '12', targetSessionId: 2, insertIndex: 0 },
  ]);
});
