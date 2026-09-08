//! Claves de IA provisionadas: no viajan en el instalador.
//! En el Mac se guardan en AppConfig (0600). No usamos Keychain: los builds
//! ad-hoc cambian de firma y macOS pide la contraseña del llavero.

use std::fs;
use std::path::PathBuf;

use tauri::AppHandle;
use zeroize::Zeroizing;

use crate::secure_db::app_config_dir;

#[cfg(target_os = "windows")]
const KEYRING_SERVICE: &str = "Telar";

struct ProviderStore {
    file: &'static str,
    #[cfg(target_os = "windows")]
    account: &'static str,
    empty: &'static str,
    corrupt: &'static str,
    save_err: &'static str,
}

const MISTRAL: ProviderStore = ProviderStore {
    file: "mistral_api.dat",
    #[cfg(target_os = "windows")]
    account: "mistral-api",
    empty: "La clave de Mistral llegó vacía.",
    corrupt: "La clave de Mistral está corrupta.",
    save_err: "No se pudo guardar la clave de Mistral",
};

const XAI: ProviderStore = ProviderStore {
    file: "xai_api.dat",
    #[cfg(target_os = "windows")]
    account: "xai-api",
    empty: "La clave de Grok llegó vacía.",
    corrupt: "La clave de Grok está corrupta.",
    save_err: "No se pudo guardar la clave de Grok",
};

fn key_path(app: &AppHandle, file: &str) -> Result<PathBuf, String> {
    Ok(app_config_dir(app)?.join(file))
}

fn store_key(app: &AppHandle, store: &ProviderStore, key: &str) -> Result<(), String> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return Err(store.empty.into());
    }

    #[cfg(target_os = "windows")]
    {
        let entry = keyring::Entry::new(KEYRING_SERVICE, store.account)
            .map_err(|e| format!("No se pudo abrir el almacén de credenciales: {e}"))?;
        entry
            .set_password(trimmed)
            .map_err(|e| format!("{}: {e}", store.save_err))?;
        return Ok(());
    }

    let path = key_path(app, store.file)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("No se pudo crear la carpeta de configuración: {e}"))?;
    }
    fs::write(&path, trimmed.as_bytes()).map_err(|e| format!("{}: {e}", store.save_err))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn load_key(app: &AppHandle, store: &ProviderStore) -> Result<Option<Zeroizing<String>>, String> {
    #[cfg(target_os = "windows")]
    {
        let entry = match keyring::Entry::new(KEYRING_SERVICE, store.account) {
            Ok(e) => e,
            Err(_) => return Ok(None),
        };
        return match entry.get_password() {
            Ok(p) if !p.trim().is_empty() => Ok(Some(Zeroizing::new(p))),
            _ => Ok(None),
        };
    }

    let path = key_path(app, store.file)?;
    if !path.is_file() {
        return Ok(None);
    }
    let bytes = fs::read(&path).map_err(|e| format!("No se pudo leer la clave: {e}"))?;
    let text = String::from_utf8(bytes).map_err(|_| store.corrupt.to_string())?;
    let trimmed = text.trim().to_string();
    if trimmed.is_empty() {
        return Ok(None);
    }
    Ok(Some(Zeroizing::new(trimmed)))
}

pub fn store_mistral_key(app: &AppHandle, key: &str) -> Result<(), String> {
    store_key(app, &MISTRAL, key)
}

pub fn load_mistral_key(app: &AppHandle) -> Result<Option<Zeroizing<String>>, String> {
    load_key(app, &MISTRAL)
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

#[tauri::command]
pub fn ai_xai_key_load(app: AppHandle) -> Result<String, String> {
    match load_key(&app, &XAI)? {
        Some(key) => Ok(key.to_string()),
        None => Ok(String::new()),
    }
}

#[tauri::command]
pub fn ai_xai_key_store(app: AppHandle, key: String) -> Result<(), String> {
    store_key(&app, &XAI, &key)
}
