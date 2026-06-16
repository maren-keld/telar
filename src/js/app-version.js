/** Versión de producto — sincronizar con src-tauri/tauri.conf.json al publicar. */
export const APP_VERSION = '0.1.0-beta.1';
export const APP_RELEASE_LABEL = 'Beta 1';

export function appVersionLabel() {
  return `${APP_RELEASE_LABEL} · v${APP_VERSION}`;
}
