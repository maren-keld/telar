/** Runtime registry for clinical packs (modules, handouts, programs, psychometrics). */

const moduleDefs = new Map();
const renderers = new Map();
const handoutDefs = new Map();
const programs = new Map();
const psychometrics = new Map();
const scorers = new Map();
const loadedPacks = new Map();
const packSearchExtra = new Map();
const tccVariables = new Map();

function skipDemoOverwrite(map, type, packId) {
  if (packId !== 'demo') return false;
  const existing = map.get(type);
  return Boolean(existing?.packId && existing.packId !== 'demo');
}

export function registerModuleDef(type, def, { packId } = {}) {
  if (!type || !def) return;
  if (skipDemoOverwrite(moduleDefs, type, packId)) return;
  moduleDefs.set(type, { ...def, packId: packId || def.packId });
}

export function registerModuleDefs(defs, { packId } = {}) {
  if (!defs || typeof defs !== 'object') return;
  for (const [type, def] of Object.entries(defs)) {
    registerModuleDef(type, def, { packId });
  }
}

export function registerRenderer(type, fn, { packId } = {}) {
  if (!type || typeof fn !== 'function') return;
  if (packId === 'demo' && renderers.get(type)?.packId && renderers.get(type).packId !== 'demo') return;
  renderers.set(type, { fn, packId });
}

export function registerHandout(type, def, { packId } = {}) {
  if (!type || !def) return;
  if (skipDemoOverwrite(handoutDefs, type, packId)) return;
  handoutDefs.set(type, { ...def, packId });
}

export function registerHandouts(defs, { packId } = {}) {
  if (!defs || typeof defs !== 'object') return;
  for (const [type, def] of Object.entries(defs)) {
    registerHandout(type, def, { packId });
  }
}

export function registerProgram(id, program, { packId } = {}) {
  if (!id || !program) return;
  programs.set(id, { ...program, id, packId });
}

export function registerPrograms(defs, { packId } = {}) {
  if (!defs || typeof defs !== 'object') return;
  for (const [id, program] of Object.entries(defs)) {
    registerProgram(id, program, { packId });
  }
}

export function registerPsychometric(type, meta, { packId } = {}) {
  if (!type || !meta) return;
  if (skipDemoOverwrite(psychometrics, type, packId)) return;
  psychometrics.set(type, { ...meta, packId });
}

export function registerPsychometrics(defs, { packId } = {}) {
  if (!defs || typeof defs !== 'object') return;
  for (const [type, meta] of Object.entries(defs)) {
    registerPsychometric(type, meta, { packId });
  }
}

/**
 * Scorer de escala aportado por un pack.
 * @typedef {object} PackScorer
 * @property {(data: object) => number|null} total   Puntaje para la serie longitudinal.
 * @property {(data: object) => string} [readable]   Texto plano para PDF / contexto IA.
 * @property {number} [yMax]                         Techo del gráfico.
 * @property {string} [color]                        Color de la línea.
 * @property {boolean} [chart]                       false = fuera de los gráficos del workspace.
 */

/** @param {string} type @param {PackScorer} scorer */
export function registerScorer(type, scorer, { packId } = {}) {
  if (!type || !scorer || typeof scorer.total !== 'function') return;
  scorers.set(type, { ...scorer, packId });
}

export function registerScorers(defs, { packId } = {}) {
  if (!defs || typeof defs !== 'object') return;
  for (const [type, scorer] of Object.entries(defs)) {
    registerScorer(type, scorer, { packId });
  }
}

/** @returns {PackScorer | null} */
export function getScorer(type) {
  return scorers.get(type) || null;
}

export function listScorerTypes() {
  return [...scorers.keys()];
}

export function registerSearchExtra(type, blob) {
  if (type && blob) packSearchExtra.set(type, blob);
}

export function registerTccVariables(type, vars) {
  if (type && vars) tccVariables.set(type, vars);
}

export function markPackLoaded(packId, manifest) {
  loadedPacks.set(packId, manifest);
}

export function getLoadedPacks() {
  return [...loadedPacks.values()];
}

export function isPackLoaded(packId) {
  return loadedPacks.has(packId);
}

export function getModuleDef(type) {
  return moduleDefs.get(type) || null;
}

export function getAllModuleDefs() {
  return Object.fromEntries(moduleDefs);
}

export function hasModuleType(type) {
  return moduleDefs.has(type);
}

export function getRenderer(type) {
  return renderers.get(type)?.fn || null;
}

export function getHandoutDef(type) {
  return handoutDefs.get(type) || null;
}

export function getAllHandoutDefs() {
  return Object.fromEntries(handoutDefs);
}

export function getProgram(id) {
  return programs.get(id) || null;
}

export function listPrograms() {
  return [...programs.values()].sort((a, b) => {
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    return (a.label || '').localeCompare(b.label || '', 'es');
  });
}

export function getPsychometric(type) {
  return psychometrics.get(type) || null;
}

export function getAllPsychometrics() {
  return Object.fromEntries(psychometrics);
}

export function getSearchExtra(type) {
  return packSearchExtra.get(type) || '';
}

export function getTccVariables(type) {
  return tccVariables.get(type) || null;
}

export function resetRegistry() {
  moduleDefs.clear();
  renderers.clear();
  handoutDefs.clear();
  programs.clear();
  psychometrics.clear();
  scorers.clear();
  loadedPacks.clear();
  packSearchExtra.clear();
  tccVariables.clear();
}
