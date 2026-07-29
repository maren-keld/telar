use std::path::PathBuf;

use serde::Deserialize;

mod ai_api;
mod secure_db;
mod touch_id;

use tauri::Manager;
use tauri_plugin_shell::ShellExt;

#[cfg(desktop)]
use tauri_plugin_updater::UpdaterExt;

#[derive(serde::Serialize)]
struct AppUpdateInfo {
    version: String,
    notes: Option<String>,
}

#[tauri::command]
#[cfg(desktop)]
async fn check_app_update(app: tauri::AppHandle) -> Result<Option<AppUpdateInfo>, String> {
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    Ok(update.map(|u| AppUpdateInfo {
        version: u.version,
        notes: u.body,
    }))
}

#[tauri::command]
#[cfg(not(desktop))]
async fn check_app_update(_app: tauri::AppHandle) -> Result<Option<AppUpdateInfo>, String> {
    Ok(None)
}

#[tauri::command]
#[cfg(desktop)]
async fn install_app_update(app: tauri::AppHandle) -> Result<(), String> {
    let Some(update) = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?
    else {
        return Err("No hay actualización disponible".into());
    };

    update
        .download_and_install(|_chunk, _total| {}, || {})
        .await
        .map_err(|e| e.to_string())?;

    app.request_restart();
    #[allow(unreachable_code)]
    Ok(())
}

#[tauri::command]
#[cfg(not(desktop))]
async fn install_app_update(_app: tauri::AppHandle) -> Result<(), String> {
    Err("Actualizaciones no disponibles en esta plataforma".into())
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("No se pudo abrir el enlace: {e}"))?;
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|e| format!("No se pudo abrir el enlace: {e}"))?;
        return Ok(());
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("No se pudo abrir el enlace: {e}"))?;
        Ok(())
    }
}

#[tauri::command]
async fn open_pdf_export(
    app: tauri::AppHandle,
    filename: String,
    data: Vec<u8>,
) -> Result<(), String> {
    let dir = app
        .path()
        .document_dir()
        .map_err(|e| format!("No se pudo resolver carpeta Documentos: {e}"))?;
    let exports = dir.join("Telar").join("exportaciones");
    std::fs::create_dir_all(&exports)
        .map_err(|e| format!("No se pudo crear carpeta de exportaciones: {e}"))?;
    let path = exports.join(&filename);
    std::fs::write(&path, &data).map_err(|e| format!("No se pudo guardar el PDF: {e}"))?;
    app.shell()
        .open(path.to_string_lossy().to_string(), None)
        .map_err(|e| format!("No se pudo abrir el PDF: {e}"))?;
    Ok(())
}

#[derive(Debug, Deserialize)]
struct ExportFile {
    name: String,
    content: String,
}

#[tauri::command]
async fn save_data_export(
    app: tauri::AppHandle,
    folder_name: String,
    files: Vec<ExportFile>,
) -> Result<String, String> {
    let dir = app
        .path()
        .document_dir()
        .map_err(|e| format!("No se pudo resolver carpeta Documentos: {e}"))?;
    let exports = dir
        .join("Telar")
        .join("exportaciones")
        .join(&folder_name);
    std::fs::create_dir_all(&exports)
        .map_err(|e| format!("No se pudo crear carpeta de exportación: {e}"))?;
    for file in files {
        let path = exports.join(&file.name);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("No se pudo crear subcarpeta: {e}"))?;
        }
        std::fs::write(&path, file.content.as_bytes())
            .map_err(|e| format!("No se pudo guardar {}: {e}", file.name))?;
    }
    app.shell()
        .open(exports.to_string_lossy().to_string(), None)
        .map_err(|e| format!("No se pudo abrir la carpeta de exportación: {e}"))?;
    Ok(exports.to_string_lossy().to_string())
}

// --- DB cifrada (PIN) ---
use secure_db::{
    backup_encrypted_db, db_execute, db_lock, db_select, db_status, db_unlock, db_unlock_touch_id,
    db_wipe_all_data, touch_id_available, touch_id_clear_stored_key, touch_id_has_stored_key,
    touch_id_prompt, touch_id_register_pin,
};

#[tauri::command]
async fn db_backup_encrypted(app: tauri::AppHandle) -> Result<String, String> {
    let path = backup_encrypted_db(&app)?;
    let parent = PathBuf::from(&path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or(path.clone());
    app.shell()
        .open(parent, None)
        .map_err(|e| format!("Respaldo creado pero no se pudo abrir la carpeta: {e}"))?;
    Ok(path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            check_app_update,
            install_app_update,
            db_status,
            db_unlock,
            db_unlock_touch_id,
            touch_id_available,
            touch_id_has_stored_key,
            touch_id_clear_stored_key,
            touch_id_register_pin,
            touch_id_prompt,
            db_lock,
            db_select,
            db_execute,
            open_external_url,
            open_pdf_export,
            save_data_export,
            db_wipe_all_data,
            db_backup_encrypted,
            ai_api::ai_chat_completion,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            touch_id::purge_legacy_keychain();

            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
            }
            #[cfg(debug_assertions)]
            {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.open_devtools();
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error al iniciar Telar");
}
