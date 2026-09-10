import { STALE_SHARED_RESPONSE } from './module-save-coordinator.js';

/** Autoguardado estilo Bubble — debounce en inputs de un contenedor */
export function debounce(fn, ms = 450) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

const pendingAutoSaves = new Set();
const saveQueues = new WeakMap();
/** Promesas de enqueueSave en vuelo (no WeakMap: flush tiene que esperarlas). */
const inFlightSaves = new Set();
/** saveFn que falló: el flush reintenta con los valores actuales del form. */
const failedSaveFns = new Set();

async function waitInFlightSaves() {
  while (inFlightSaves.size) {
    await Promise.allSettled([...inFlightSaves]);
  }
}

/** Serializa todas las escrituras de la misma función (autobind + persist suelto). */
export function enqueueSave(saveFn) {
  if (typeof saveFn !== 'function') return Promise.resolve();
  const prev = saveQueues.get(saveFn) || Promise.resolve();
  const job = prev.then(
    () => saveFn(),
    () => saveFn(),
  );
  inFlightSaves.add(job);
  saveQueues.set(
    saveFn,
    job.then(
      () => {},
      () => {},
    ),
  );
  return job.then(
    (value) => {
      inFlightSaves.delete(job);
      failedSaveFns.delete(saveFn);
      return value;
    },
    (err) => {
      inFlightSaves.delete(job);
      if (err?.code !== STALE_SHARED_RESPONSE) failedSaveFns.add(saveFn);
      else failedSaveFns.delete(saveFn);
      throw err;
    },
  );
}

/** persist() suelto y autobind comparten la misma cola si saveFn es la misma referencia. */
export function queuedPersist(saveFn, onError) {
  return () =>
    enqueueSave(saveFn).catch((err) => {
      onError?.(err);
      throw err;
    });
}

/** Guarda inmediatamente los formularios con debounce o escritura en curso. */
export async function flushPendingAutoSaves() {
  await waitInFlightSaves();

  const toRetry = [...failedSaveFns];
  failedSaveFns.clear();
  const retryResults = await Promise.allSettled(toRetry.map((fn) => enqueueSave(fn)));
  await waitInFlightSaves();

  const handleResults = await Promise.allSettled([...pendingAutoSaves].map((job) => job.flush()));
  await waitInFlightSaves();

  const failed =
    retryResults.find((r) => r.status === 'rejected' && r.reason?.code !== STALE_SHARED_RESPONSE) ||
    handleResults.find((r) => r.status === 'rejected');
  if (failed) throw failed.reason || new Error('No se pudo guardar');
  if (failedSaveFns.size) throw new Error('No se pudo guardar');
}

/** Solo tests: evita que un handle sucio contamine el siguiente caso. */
export function resetAutoSaveHandlesForTests() {
  pendingAutoSaves.clear();
  inFlightSaves.clear();
  failedSaveFns.clear();
}

export function bindAutoSave(root, saveFn, { debounceMs = 450, onStatus } = {}) {
  const noop = () => {};
  noop.now = async () => {};
  if (!root) return noop;

  let timer = null;
  let dirty = false;
  let gate = Promise.resolve();

  const saveNow = async () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const run = gate.then(async () => {
      if (!dirty) {
        if (!root.isConnected) pendingAutoSaves.delete(handle);
        return;
      }
      dirty = false;
      try {
        onStatus?.('guardando');
        await enqueueSave(saveFn);
        onStatus?.('guardado');
        if (!root.isConnected) pendingAutoSaves.delete(handle);
      } catch (e) {
        if (e?.code === STALE_SHARED_RESPONSE) {
          // This form belongs to the old response. Do not retry it when the
          // workspace flushes before repainting the received response.
          dirty = false;
          pendingAutoSaves.delete(handle);
          onStatus?.('error');
          return;
        }
        dirty = true;
        console.error(e);
        onStatus?.('error');
        throw e;
      }
    });
    gate = run.then(
      () => {},
      () => {},
    );
    await run;
  };

  const handle = { flush: saveNow };
  pendingAutoSaves.add(handle);

  const run = () => {
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void saveNow().catch(() => {});
    }, debounceMs);
  };

  run.now = () => {
    dirty = true;
    return saveNow();
  };

  const handler = (e) => {
    const t = e.target;
    if (!t.matches('input, textarea, select')) return;
    if (t.type === 'submit' || t.closest('[data-no-autobind]')) return;
    const instant =
      e.type === 'change' && (t.type === 'radio' || t.type === 'checkbox' || t.tagName === 'SELECT');
    if (instant) {
      dirty = true;
      void saveNow().catch(() => {});
      return;
    }
    run();
  };

  root.addEventListener('input', handler);
  root.addEventListener('change', handler);

  return run;
}

function flushOnLeave() {
  void flushPendingAutoSaves().catch(() => {});
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
