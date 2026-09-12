/** Versión de producto — sincronizar con src-tauri/tauri.conf.json al publicar. */
export const APP_VERSION = '0.2.0-beta.1';

export function appVersionLabel() {
  return `v${APP_VERSION}`;
}
