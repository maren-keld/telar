/**
 * Loads clinical packs from src/packs/ at boot.
 * Prod: embedded in frontendDist. Dev: same path via dev server.
 * Optional override: localStorage telar.packsDir (absolute URL prefix) for QA.
 */
import {
  markPackLoaded,
  registerHandouts,
  registerModuleDefs,
  registerPrograms,
  registerPsychometrics,
  registerRenderer,
  registerSearchExtra,
  registerTccVariables,
} from './pack-registry.js';

const PACK_SCHEMA = 1;
const KNOWN_PACK_ORDER = [
  'clinical-shared',
  'tdah-adulto',
  'trauma-regulacion',
  'ansiedad-depresion',
  'demo',
];

/** @type {Promise<void> | null} */
let loadPromise = null;

function packsBaseUrl() {
  const override = typeof localStorage !== 'undefined' ? localStorage.getItem('telar.packsDir') : null;
  if (override) return override.replace(/\/?$/, '/');
  return new URL('../packs/', import.meta.url).href;
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function discoverPackIds(base) {
  const ids = new Set();
  await Promise.all(
    KNOWN_PACK_ORDER.map(async (id) => {
      try {
        // GET (no HEAD): el protocolo de assets embebidos en Tauri no siempre soporta HEAD.
        const res = await fetch(`${base}${id}/pack.json`, { cache: 'no-store' });
        if (res.ok) ids.add(id);
      } catch {
        /* skip */
      }
    }),
  );
  try {
    const index = await fetchJson(`${base}index.json`);
    for (const id of index.packs || []) ids.add(id);
  } catch {
    /* optional index */
  }
  return [...ids].sort((a, b) => {
    const ia = KNOWN_PACK_ORDER.indexOf(a);
    const ib = KNOWN_PACK_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function validateManifest(manifest, packId) {
  if (!manifest || manifest.schema !== PACK_SCHEMA) {
    throw new Error(`pack ${packId}: invalid schema (expected ${PACK_SCHEMA})`);
  }
  if (manifest.id && manifest.id !== packId) {
    console.warn(`[packs] id mismatch folder=${packId} manifest=${manifest.id}`);
  }
}

async function loadPackData(base, packId, manifest) {
  const prefix = `${base}${packId}/`;

  if (manifest.moduleDefs) {
    registerModuleDefs(manifest.moduleDefs, { packId });
  } else if (manifest.moduleDefsPath) {
    const defs = await fetchJson(`${prefix}${manifest.moduleDefsPath}`);
    registerModuleDefs(defs, { packId });
  }

  if (manifest.handouts) {
    registerHandouts(manifest.handouts, { packId });
  } else if (manifest.handoutsPath) {
    const handouts = await fetchJson(`${prefix}${manifest.handoutsPath}`);
    registerHandouts(handouts, { packId });
  }

  if (manifest.programs) {
    registerPrograms(manifest.programs, { packId });
  } else if (manifest.programsPath) {
    const programs = await fetchJson(`${prefix}${manifest.programsPath}`);
    registerPrograms(programs, { packId });
  }

  if (manifest.psychometrics) {
    registerPsychometrics(manifest.psychometrics, { packId });
  } else if (manifest.psychometricsPath) {
    const psych = await fetchJson(`${prefix}${manifest.psychometricsPath}`);
    registerPsychometrics(psych, { packId });
  }

  if (manifest.searchExtra) {
    for (const [type, blob] of Object.entries(manifest.searchExtra)) {
      registerSearchExtra(type, blob);
    }
  }

  if (manifest.tccVariables) {
    for (const [type, vars] of Object.entries(manifest.tccVariables)) {
      registerTccVariables(type, vars);
    }
  }

  const rendererMap = manifest.renderers || {};
  for (const [type, relPath] of Object.entries(rendererMap)) {
    try {
      const mod = await import(/* @vite-ignore */ `${prefix}${relPath}`);
      const fn =
        mod.default ||
        mod[`render${type.split('_').map((p) => p[0].toUpperCase() + p.slice(1)).join('')}`] ||
        Object.values(mod).find((v) => typeof v === 'function' && v.name.startsWith('render'));
      if (typeof fn !== 'function') {
        console.warn(`[packs] ${packId}: no renderer export for ${type}`);
        continue;
      }
      registerRenderer(type, fn, { packId });
    } catch (err) {
      console.warn(`[packs] ${packId}: failed renderer ${type}:`, err?.message || err);
    }
  }

  if (manifest.entry) {
    try {
      const mod = await import(/* @vite-ignore */ `${prefix}${manifest.entry}`);
      if (typeof mod.registerPack === 'function') {
        await mod.registerPack({ packId, baseUrl: prefix, manifest });
      } else if (typeof mod.default === 'function') {
        await mod.default({ packId, baseUrl: prefix, manifest });
      }
    } catch (err) {
      console.warn(`[packs] ${packId}: entry failed:`, err?.message || err);
    }
  }

  markPackLoaded(packId, manifest);
}

async function loadAllPacks() {
  const base = packsBaseUrl();
  const packIds = await discoverPackIds(base);
  if (!packIds.length) {
    console.info('[packs] no packs found — using legacy fallback only');
    return;
  }
  for (const packId of packIds) {
    try {
      const manifest = await fetchJson(`${base}${packId}/pack.json`);
      validateManifest(manifest, packId);
      await loadPackData(base, packId, manifest);
      console.info(`[packs] loaded ${packId} v${manifest.version || '?'}`);
    } catch (err) {
      console.warn(`[packs] skip ${packId}:`, err?.message || err);
    }
  }
}

export function loadPacks() {
  if (!loadPromise) loadPromise = loadAllPacks();
  return loadPromise;
}

export function resetPackLoaderForTests() {
  loadPromise = null;
}
