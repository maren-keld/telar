/** Autoguardado estilo Bubble — debounce en inputs de un contenedor */
export function debounce(fn, ms = 450) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

const pendingAutoSaves = new Set();

/** Guarda inmediatamente los formularios con debounce pendiente (antes de un re-render). */
export async function flushPendingAutoSaves() {
  const jobs = [...pendingAutoSaves];
  await Promise.all(jobs.map((job) => job.flush()));
}

export function bindAutoSave(root, saveFn, { debounceMs = 450, onStatus } = {}) {
  if (!root) return () => {};
  let timer = null;

  const saveNow = async () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!root.isConnected) {
      pendingAutoSaves.delete(handle);
      return;
    }
    try {
      onStatus?.('guardando');
      await saveFn();
      onStatus?.('guardado');
    } catch (e) {
      console.error(e);
      onStatus?.('error');
    }
  };

  const handle = { flush: saveNow };
  pendingAutoSaves.add(handle);

  const run = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void saveNow();
    }, debounceMs);
  };

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

function flushOnLeave() {
  void flushPendingAutoSaves();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushOnLeave();
  });
  window.addEventListener('pagehide', flushOnLeave);
}

export function collectFormData(root) {
  const data = {};
  if (!root) return data;
  root.querySelectorAll('input, textarea, select').forEach((el) => {
    const name = el.name;
    if (!name || el.type === 'submit') return;
    if (el.type === 'checkbox') data[name] = el.checked;
    else if (el.type === 'radio') {
      if (el.checked) data[name] = el.value;
    } else data[name] = el.value;
  });
  // Compat: Object.fromEntries(fd.entries()) no debe romper el autoguardado.
  Object.defineProperty(data, 'entries', {
    enumerable: false,
    value() {
      return Object.entries(this);
    },
  });
  return data;
}

/** Unifica FormData y el objeto plano de collectFormData. */
export function formPayload(data) {
  if (!data) return {};
  if (typeof FormData !== 'undefined' && data instanceof FormData) {
    return Object.fromEntries(data.entries());
  }
  if (typeof data.entries === 'function') {
    try {
      return Object.fromEntries(data.entries());
    } catch {
      /* objeto plano */
    }
  }
  return { ...data };
}
