//! Clave Mistral provisionada: no viaja en el instalador.
//! En el Mac se guarda en AppConfig (0600). No usamos Keychain: los builds
//! ad-hoc cambian de firma y macOS pide la contraseña del llavero.

use std::fs;
use std::path::PathBuf;

use tauri::AppHandle;
use zeroize::Zeroizing;

use crate::secure_db::app_config_dir;

const KEY_FILE: &str = "mistral_api.dat";

#[cfg(target_os = "windows")]
const KEYRING_SERVICE: &str = "Telar";
#[cfg(target_os = "windows")]
const KEYRING_ACCOUNT: &str = "mistral-api";

fn key_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_config_dir(app)?.join(KEY_FILE))
}

pub fn store_mistral_key(app: &AppHandle, key: &str) -> Result<(), String> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return Err("La clave de Mistral llegó vacía.".into());
    }

    #[cfg(target_os = "windows")]
    {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT)
            .map_err(|e| format!("No se pudo abrir el almacén de credenciales: {e}"))?;
        entry
            .set_password(trimmed)
            .map_err(|e| format!("No se pudo guardar la clave de Mistral: {e}"))?;
        return Ok(());
    }

    let path = key_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("No se pudo crear la carpeta de configuración: {e}"))?;
    }
    fs::write(&path, trimmed.as_bytes())
        .map_err(|e| format!("No se pudo guardar la clave de Mistral: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

pub fn load_mistral_key(app: &AppHandle) -> Result<Option<Zeroizing<String>>, String> {
    #[cfg(target_os = "windows")]
    {
        let entry = match keyring::Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT) {
            Ok(e) => e,
            Err(_) => return Ok(None),
        };
        return match entry.get_password() {
            Ok(p) if !p.trim().is_empty() => Ok(Some(Zeroizing::new(p))),
            _ => Ok(None),
        };
    }

    let path = key_path(app)?;
    if !path.is_file() {
        return Ok(None);
    }
    let bytes =
        fs::read(&path).map_err(|e| format!("No se pudo leer la clave de Mistral: {e}"))?;
    let text = String::from_utf8(bytes).map_err(|_| "La clave de Mistral está corrupta.".to_string())?;
    let trimmed = text.trim().to_string();
    if trimmed.is_empty() {
        return Ok(None);
    }
    Ok(Some(Zeroizing::new(trimmed)))
}

#[tauri::command]
pub fn ai_mistral_key_load(app: AppHandle) -> Result<String, String> {
    match load_mistral_key(&app)? {
        Some(key) => Ok(key.to_string()),
        None => Ok(String::new()),
    }
}

#[tauri::command]
pub fn ai_mistral_key_store(app: AppHandle, key: String) -> Result<(), String> {
    store_mistral_key(&app, &key)
}
