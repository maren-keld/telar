import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_MODULE_THEME,
  applyThemeToCandidate,
  buildModuleAiSystemPrompt,
  isColorTheme,
  normalizeThemeId,
  themeCssVars,
  themePromptBlock,
} from '../../src/js/module-themes.js';

const BASE = 'Eres un asistente que crea módulos clínicos para Telar.';

test('clínico es el default y no inyecta variables de color', () => {
  assert.equal(normalizeThemeId(''), DEFAULT_MODULE_THEME);
  assert.equal(normalizeThemeId('inventado'), 'clinico');
  assert.equal(isColorTheme('clinico'), false);
  assert.equal(themeCssVars('clinico'), '');
});

test('el prompt clínico pide adaptar CodePen sin rediseñar', () => {
  const prompt = buildModuleAiSystemPrompt(BASE, 'clinico');
  assert.match(prompt, /CLÍNICO/i);
  assert.match(prompt, /CodePen/);
  assert.match(prompt, /SIN rediseñarlo/);
  assert.match(prompt, /Telar\.save/);
  assert.doesNotMatch(prompt, /theme": "pictos"/);
});

test('el prompt colorido pide apoyos visuales y sella theme', () => {
  const block = themePromptBlock('pictos');
  assert.match(block, /COLORIDO/);
  assert.match(block, /44px/);
  assert.match(block, /#ffd54f/);
  assert.match(block, /theme": "pictos"/);
  assert.ok(isColorTheme('pictos'));
  assert.match(themeCssVars('pictos'), /--telar-c1:#ffd54f/);
});

test('applyThemeToCandidate sella el estilo aunque la IA no lo ponga', () => {
  const q = applyThemeToCandidate({ kind: 'questionnaire', def: { title: 'X' } }, 'pictos');
  assert.equal(q.theme, 'pictos');
  assert.equal(q.def.theme, 'pictos');

  const clinical = applyThemeToCandidate({ kind: 'questionnaire', def: { title: 'Y', theme: 'pictos' } }, 'clinico');
  assert.equal(clinical.theme, 'clinico');
  assert.equal(clinical.def.theme, undefined);

  const html = applyThemeToCandidate({ kind: 'interactive', html: '<div></div>' }, 'sensorial');
  assert.equal(html.theme, 'sensorial');
});
