/**
 * Puente mínimo a Tauri (sin npm). Requiere withGlobalTauri: true en tauri.conf.json
 */
export function isTauriApp() {
  return Boolean(window.__TAURI__?.core?.invoke);
}

export function getInvoke() {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) {
    throw new Error(
      'Esta pantalla debe abrirse desde Telar.app. Si ya la abriste y ves esto, reinstala la última versión desde dist/.',
    );
  }
  return invoke;
}

export async function openExternalUrl(url) {
  if (isTauriApp()) {
    await getInvoke()('open_external_url', { url });
    return;
  }
  window.open(url, '_blank', 'noopener');
}

export async function loadSqlDatabase(dbName = 'sqlite:telar.db') {
  const invoke = getInvoke();
  // dbName se ignora: la DB se abre en Rust (cifrada) tras desbloqueo.
  const path = 'secure-db';
  return {
    path,
    select(query, bindValues = []) {
      return invoke('db_select', { args: { query, values: bindValues } });
    },
    async execute(query, bindValues = []) {
      const result = await invoke('db_execute', { args: { query, values: bindValues } });
      const [rowsAffected, lastInsertId] = Array.isArray(result) ? result : [0, 0];
      return { rowsAffected, lastInsertId };
    },
  };
}
