import { CASE_STUDY_AXES } from '../case-study-model.js';
const KEY = 'telar.workspace.studyPreferences';
export function studyPreferences() {
  try { return { defense: false, development: false, rightPanel: 'notes', ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { defense: false, development: false, rightPanel: 'notes' }; }
}
export function visibleStudyAxes() {
  const prefs = studyPreferences();
  return CASE_STUDY_AXES.filter((axis) => !axis.optional || prefs[axis.id]);
}
export function openWorkspaceCustomize() {
  const root = document.getElementById('modal-root');
  const prefs = studyPreferences();
  root.innerHTML = `<div class="modal-backdrop" data-close><section class="modal workspace-customize" role="dialog" aria-modal="true" aria-labelledby="workspace-customize-title">
    <header class="workspace-customize__head"><h2 id="workspace-customize-title">Personalizar</h2></header>
    <p class="workspace-customize__hint">Habilidades forma parte de los ejes predeterminados.</p>
    <label class="workspace-customize__option"><input type="checkbox" data-pref="defense" ${prefs.defense ? 'checked' : ''}><span>Defensas psíquicas<small>Orientación psicodinámica</small></span></label>
    <label class="workspace-customize__option"><input type="checkbox" data-pref="development" ${prefs.development ? 'checked' : ''}><span>Oportunidades de desarrollo<small>Metas y capacidades que la persona quiere potenciar</small></span></label>
    <div class="workspace-customize__panel"><p>Panel derecho en Estudio</p><div class="workspace-customize__choices" role="group" aria-label="Panel derecho en Estudio">
      <button type="button" class="workspace-customize__choice${prefs.rightPanel === 'notes' ? ' is-selected' : ''}" data-panel="notes" aria-pressed="${prefs.rightPanel === 'notes'}">Bitácora</button>
      <button type="button" class="workspace-customize__choice${prefs.rightPanel === 'sessions' ? ' is-selected' : ''}" data-panel="sessions" aria-pressed="${prefs.rightPanel === 'sessions'}">Índice de sesiones</button>
    </div></div>
    <footer class="workspace-customize__foot"><button type="button" class="btn btn-primary" data-done>Cerrar</button></footer>
  </section></div>`;
  const close = () => { root.innerHTML = ''; };
  root.querySelector('[data-done]').addEventListener('click', close);
  root.querySelector('[data-close]').addEventListener('click', (e) => { if (e.target === e.currentTarget) close(); });
  root.querySelectorAll('[data-pref]').forEach((input) => input.addEventListener('change', () => {
    const next = { ...studyPreferences(), [input.dataset.pref]: input.checked };
    localStorage.setItem(KEY, JSON.stringify(next));
    document.dispatchEvent(new CustomEvent('telar:study-preferences'));
  }));
  root.querySelectorAll('[data-panel]').forEach((button) => button.addEventListener('click', () => {
    localStorage.setItem(KEY, JSON.stringify({ ...studyPreferences(), rightPanel: button.dataset.panel }));
    root.querySelectorAll('[data-panel]').forEach((choice) => {
      const selected = choice === button;
      choice.classList.toggle('is-selected', selected);
      choice.setAttribute('aria-pressed', String(selected));
    });
    document.dispatchEvent(new CustomEvent('telar:study-preferences'));
  }));
}
