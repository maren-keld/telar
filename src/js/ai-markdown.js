import { escapeHtml } from './utils.js';

/** Minimal, escaped formatting shared by answers and suggestion cards. */
export function renderAiMarkdown(text) {
  return escapeHtml(String(text || ''))
    .replace(/^\s*#{1,6}\s+(.+?)\s*#*\s*$/gm, '<strong>$1</strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/^\s*(?:---+|\*\*\*+)\s*$/gm, '')
    .replace(/^[-•]\s+/gm, '· ')
    .replace(/\n/g, '<br>');
}
