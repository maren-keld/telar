/** Autoguardado estilo Bubble — debounce en inputs de un contenedor */
export function debounce(fn, ms = 450) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function bindAutoSave(root, saveFn, { debounceMs = 450, onStatus } = {}) {
  if (!root) return () => {};
  const run = debounce(async () => {
    try {
      onStatus?.('guardando');
      await saveFn();
      onStatus?.('guardado');
    } catch (e) {
      console.error(e);
      onStatus?.('error');
    }
  }, debounceMs);

  const handler = (e) => {
    const t = e.target;
    if (!t.matches('input, textarea, select')) return;
    if (t.type === 'submit' || t.closest('[data-no-autobind]')) return;
    run();
  };

  root.addEventListener('input', handler);
  root.addEventListener('change', handler);

  return run;
}

export function collectFormData(root) {
  const data = {};
  root.querySelectorAll('input, textarea, select').forEach((el) => {
    const name = el.name;
    if (!name || el.type === 'submit') return;
    if (el.type === 'checkbox') data[name] = el.checked;
    else if (el.type === 'radio') {
      if (el.checked) data[name] = el.value;
    } else data[name] = el.value;
  });
  return data;
}
