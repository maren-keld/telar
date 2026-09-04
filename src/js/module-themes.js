/**
 * Estilos visuales para módulos creados con IA.
 *
 * «clínico» es el look sobrio de Telar y, si pegan un CodePen, se respeta.
 * Los otros son apoyos visuales (color, botones grandes) para material más
 * lúdico — p. ej. trabajo con TEA — sin forzarlos en escalas clínicas.
 */

export const DEFAULT_MODULE_THEME = 'clinico';

export const MODULE_THEMES = [
  {
    id: 'clinico',
    label: 'Clínico',
    short: 'Como el resto de Telar. Si pegas un CodePen, se respeta su look.',
    swatches: ['#f4f1ea', '#6b7280', '#2c3a3d'],
  },
  {
    id: 'pictos',
    label: 'Colorido',
    short: 'Apoyos visuales, botones grandes, feedback al tocar.',
    featured: true,
    swatches: ['#ffd54f', '#4fc3f7', '#ff8a65', '#81c784'],
    colors: {
      c1: '#ffd54f',
      c2: '#4fc3f7',
      c3: '#ff8a65',
      c4: '#81c784',
      ink: '#1a2a2e',
      paper: '#fff8e7',
    },
  },
  {
    id: 'sensorial',
    label: 'Suave',
    short: 'Pasteles, menos contraste, ritmo calmo.',
    swatches: ['#c5b4e3', '#f5c6aa', '#a8d5c2', '#f6e7c1'],
    colors: {
      c1: '#c5b4e3',
      c2: '#f5c6aa',
      c3: '#a8d5c2',
      c4: '#f6e7c1',
      ink: '#3d3550',
      paper: '#f7f3ee',
    },
  },
];

const THEME_IDS = new Set(MODULE_THEMES.map((t) => t.id));

export function normalizeThemeId(id) {
  const key = String(id || '').trim();
  return THEME_IDS.has(key) ? key : DEFAULT_MODULE_THEME;
}

export function getModuleTheme(id) {
  const nid = normalizeThemeId(id);
  return MODULE_THEMES.find((t) => t.id === nid);
}

export function isColorTheme(id) {
  return normalizeThemeId(id) !== DEFAULT_MODULE_THEME;
}

/** Variables CSS para el iframe interactivo (vacío en clínico, para no pisar un CodePen). */
export function themeCssVars(id) {
  const t = getModuleTheme(id);
  if (!t?.colors) return '';
  const { c1, c2, c3, c4, ink, paper } = t.colors;
  return `--telar-c1:${c1};--telar-c2:${c2};--telar-c3:${c3};--telar-c4:${c4};--telar-ink:${ink};--telar-paper:${paper};`;
}

export function themePromptBlock(id) {
  const t = getModuleTheme(id);
  if (t.id === 'clinico') {
    return `Estilo visual: CLÍNICO (por defecto).
- Si el terapeuta pega HTML/CSS/JS o un CodePen: adáptalo a la lógica modular de Telar SIN rediseñarlo. Conserva colores, tipografía, layout y animaciones. Solo: quita CDN, fetch y fuentes remotas (incrusta CSS/JS); cablea Telar.load / Telar.save / Telar.done / Telar.resize donde haga falta persistir o completar; un solo bloque \`\`\`html.
- Si pide un cuestionario o escala nueva: Opción A (JSON), look clínico, sin paleta extra ni "theme".
- No inventes colores vistosos ni gamifiques a menos que lo pidan.`;
  }
  const { paper, ink, c1, c2, c3, c4 } = t.colors;
  const preferHtml = `PREFERÍ Opción B (\`\`\`html) salvo que pidan explícitamente una escala clínica con puntaje.`;
  const palette = `Paleta fija (hex, sin CDN ni fuentes remotas): fondo ${paper}, texto ${ink}, acentos ${c1} / ${c2} / ${c3} / ${c4}. También puedes usar var(--telar-c1) … var(--telar-paper).`;
  const jsonTheme = `Si igual devuelves JSON de cuestionario, incluye "theme": "${t.id}".`;
  if (t.id === 'pictos') {
    return `Estilo visual: COLORIDO — apoyos visuales (material más lúdico o TEA).
${preferHtml}
${palette}
Diseño: un concepto por pantalla o tarjeta, botones grandes (mín. 44px), contraste claro, feedback visual inmediato al tocar (color, check, celebración breve). Sin ruido sensorial: nada de parpadeos rápidos ni autoplay de sonido. Texto corto en segunda persona.
${jsonTheme}`;
  }
  return `Estilo visual: SUAVE — pasteles, ritmo calmo.
${preferHtml}
${palette}
Botones grandes, transiciones suaves, sin destellos. Texto corto en segunda persona.
${jsonTheme}`;
}

export function buildModuleAiSystemPrompt(basePrompt, themeId) {
  return `${basePrompt}\n\n${themePromptBlock(themeId)}`;
}

/** Sella el tema elegido en el candidato, aunque la IA se haya olvidado del campo. */
export function applyThemeToCandidate(candidate, themeId) {
  if (!candidate) return candidate;
  const id = normalizeThemeId(themeId);
  candidate.theme = id;
  if (candidate.kind === 'questionnaire' && candidate.def && typeof candidate.def === 'object') {
    if (id === DEFAULT_MODULE_THEME) delete candidate.def.theme;
    else candidate.def.theme = id;
  }
  return candidate;
}
