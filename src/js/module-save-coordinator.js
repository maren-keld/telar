import { parseJsonSafe } from './utils.js';

export const STALE_SHARED_RESPONSE = 'STALE_SHARED_RESPONSE';

/** One writer per module, including saves from different mounted forms. */
export function createModuleSaveCoordinator({ read, merge, write, finish }) {
  const queues = new Map();

  async function waitUntilIdle() {
    while (queues.size) {
      await Promise.all([...queues.values()]);
    }
  }

  function save(moduleRow, payload, status) {
    const id = String(moduleRow.id);
    const job = (queues.get(id) || Promise.resolve()).then(async () => {
      const fresh = await read(moduleRow.id);
      if (!fresh) throw new Error('El módulo ya no existe. Vuelve a abrir la ficha.');
      const previous = parseJsonSafe(moduleRow.data, {});
      const current = parseJsonSafe(fresh.data, {});
      if (current.share_answered_at && current.share_answered_at !== previous.share_answered_at) {
        const error = new Error('Llegó una respuesta del paciente. Vuelve a abrir el módulo antes de editarlo.');
        error.code = STALE_SHARED_RESPONSE;
        throw error;
      }
      const st = status || fresh.status || 'pendiente';
      const merged = merge(fresh, payload);
      await write(moduleRow.id, merged, st);
      finish(moduleRow, merged, st);
      return merged;
    });
    const tail = job.then(() => {}, () => {});
    queues.set(id, tail);
    void tail.then(() => {
      if (queues.get(id) === tail) queues.delete(id);
    });
    return job;
  }

  save.waitUntilIdle = waitUntilIdle;
  return save;
}
