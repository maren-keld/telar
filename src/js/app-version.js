/** Versión de producto — sincronizar con src-tauri/tauri.conf.json al publicar. */
export const APP_VERSION = '0.1.0-beta.18';

export function appVersionLabel() {
  return `v${APP_VERSION}`;
}
