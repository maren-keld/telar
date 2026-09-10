import { toast } from './utils.js';

/** Autoguardado silencioso en éxito; aviso si no se pudo persistir. */
export function setWorkspaceSaveStatus() {}

export function notifySaveError() {
  toast('No se pudo guardar. Sigue en esta pantalla e intenta de nuevo.');
}

export function workspaceAutoSaveStatus() {
  return {
    onStatus(status) {
      if (status === 'error') notifySaveError();
    },
  };
}
