/**
 * Datos del editor de módulos (pantalla completa): categorías, edad, payload.
 */
import {
  isValidItemType,
  itemTypeNeedsOptions,
} from './custom-module-items.js';
import { extractInteractiveHtml } from './interactive-experience.js';
import { CATEGORY_LABELS, CATEGORY_ORDER } from './module-categories.js';
import { optionsForItem, questionnaireItems } from '../lib/questionnaire-schema.js';
import { WHERE_IDS, WHERE_LABELS } from './module-where.js';

export const PENDING_CUSTOM_MODULE_KEY = 'telar-pending-custom-module';

export const AUDIENCE_OPTIONS = [
  { id: 'todas', label: 'Todas las edades' },
  { id: 'ninos', label: 'Niños' },
  { id: 'adolescentes', label: 'Adolescentes' },
  { id: 'adultos', label: 'Adultos' },
];

export const EDITOR_CATEGORIES = CATEGORY_ORDER.map((id) => ({
  id,
  label: CATEGORY_LABELS[id],
}));

export const EDITOR_WHERES = WHERE_IDS.map((id) => ({
  id,
  label: WHERE_LABELS[id],
}));

export const EDITOR_KINDS = [
  { id: 'questionnaire', label: 'Cuestionario' },
  { id: 'interactive', label: 'Experiencia interactiva' },
];

export function canSwitchModuleKind(
  nextKind,
  { kindLocked = false, interactiveChatLocked = false, currentKind = '' } = {},
) {
  const locked = kindLocked || interactiveChatLocked;
  if (!locked) return true;
  if (currentKind) return nextKind === currentKind;
  if (interactiveChatLocked) return nextKind === 'interactive';
  return true;
}

function optionLabel(opt) {
  if (typeof opt === 'string') return opt.trim();
  return String(opt?.label || opt?.v || '').trim();
}

function normalizeEditorQuestion(q, i) {
  const text = String(q?.text || '').trim();
  if (!text) return null;
  let type = isValidItemType(q.type) ? q.type : 'text';
  if (q.kind === 'slider') type = 'scale';
  const options = itemTypeNeedsOptions(type)
    ? (Array.isArray(q.options) ? q.options : []).map(optionLabel).filter(Boolean)
    : [];
  if (itemTypeNeedsOptions(type) && !options.length) options.push('Opción 1');
  return { id: q.id || `q${i + 1}`, text, type, options };
}

export function questionsFromAiJson(code) {
  const data = JSON.parse(code);
  if (Array.isArray(data.questions)) {
    return data.questions.map(normalizeEditorQuestion).filter(Boolean);
  }
  if (!Array.isArray(data.items)) return [];
  return questionnaireItems(data)
    .map((item, i) => {
      const text = String(item.text || '').trim();
      if (!text) return null;
      if (item.kind === 'slider') return { id: `q${i + 1}`, text, type: 'scale', options: [] };
      const opts = optionsForItem(data, item.index).map(optionLabel).filter(Boolean);
      if (opts.length) return { id: `q${i + 1}`, text, type: 'checkbox', options: opts };
      return { id: `q${i + 1}`, text, type: 'text', options: [] };
    })
    .filter(Boolean);
}

export function parseAiModuleReply(text, { preferInteractive = false, preferQuestionnaire = false } = {}) {
  const raw = String(text || '');
  const html = extractInteractiveHtml(raw);
  if (preferInteractive) {
    return html ? { kind: 'interactive', html } : null;
  }

  const questionsFromCode = (code) => {
    try {
      const questions = questionsFromAiJson(code);
      return questions.length ? { kind: 'questionnaire', questions } : null;
    } catch {
      return null;
    }
  };

  const telar = raw.match(/```telar-module\s*([\s\S]*?)```/i)?.[1]?.trim();
  const json = raw.match(/```json\s*([\s\S]*?)```/i)?.[1]?.trim();
  const code = telar || json;
  if (code) {
    const parsed = questionsFromCode(code);
    if (parsed) return parsed;
  }

  if (preferQuestionnaire) return null;

  if (html) return { kind: 'interactive', html };

  const any = raw.match(/```(?!html)\s*([\s\S]*?)```/i)?.[1]?.trim();
  if (any?.startsWith('{')) {
    const parsed = questionsFromCode(any);
    if (parsed) return parsed;
  }
  return null;
}

export function normalizeAudience(id) {
  return AUDIENCE_OPTIONS.some((opt) => opt.id === id) ? id : 'todas';
}

export function normalizeEditorCategory(id) {
  return CATEGORY_ORDER.includes(id) ? id : 'tcc';
}

export function normalizeEditorWhere(id) {
  return WHERE_IDS.includes(id) ? id : 'entre_sesiones';
}

export function rememberPendingCustomModuleType(type) {
  try {
    if (type) sessionStorage.setItem(PENDING_CUSTOM_MODULE_KEY, type);
  } catch {
    /* storage bloqueado */
  }
}

export function takePendingCustomModuleType() {
  try {
    const type = sessionStorage.getItem(PENDING_CUSTOM_MODULE_KEY) || '';
    if (type) sessionStorage.removeItem(PENDING_CUSTOM_MODULE_KEY);
    return type;
  } catch {
    return '';
  }
}

export function collectQuestionsFrom(root) {
  const questions = [];
  root.querySelectorAll('.cm-question').forEach((block, i) => {
    const text = block.querySelector('[data-field="text"]')?.value?.trim();
    const rawType = block.querySelector('[data-field="type"]')?.value;
    const type = isValidItemType(rawType) ? rawType : 'checkbox';
    if (!text) return;
    const q = { id: block.dataset.qid || `q${i + 1}`, text, type, options: [] };
    if (itemTypeNeedsOptions(type)) {
      block.querySelectorAll('[data-option]').forEach((inp) => {
        const v = inp.value?.trim();
        if (v) q.options.push(v);
      });
      if (!q.options.length) q.options = ['Opción 1'];
    }
    questions.push(q);
  });
  return questions;
}

export function shareCompletedByLinkLabel() {
  return 'Completado por el enlace';
}

/**
 * @param {object} fields
 */
export function buildCustomModuleRecord(fields) {
  const existing = fields.existing || {};
  const kind = fields.kind === 'interactive' ? 'interactive' : 'simple';
  const title = String(fields.title || '').trim();
  const record = {
    ...existing,
    id: fields.id || existing.id,
    kind,
    title,
    description: String(fields.description || '').trim(),
    author: String(fields.author || '').trim(),
    instructions: String(fields.instructions || '').trim(),
    category: normalizeEditorCategory(fields.category || existing.category),
    audience: normalizeAudience(fields.audience || existing.audience),
    where: normalizeEditorWhere(fields.where || existing.where),
    pdfName: fields.pdfName || existing.pdfName || '',
    pdfPath: fields.pdfPath || existing.pdfPath || '',
    createdAt: existing.createdAt || new Date().toISOString(),
  };
  if (kind === 'interactive') {
    record.html = fields.html || '';
    delete record.questions;
  } else {
    record.questions = Array.isArray(fields.questions) ? fields.questions : [];
    delete record.html;
  }
  if (!record.pdfPath) {
    record.pdfName = '';
    record.pdfPath = '';
  }
  return record;
}
