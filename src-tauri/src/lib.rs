use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};

use serde::Deserialize;

mod ai_api;
mod desktop_notify;
mod backup;
mod interactive;
mod muse_ble;
mod ollama;
mod packfile;
mod secure_db;
mod subscription_api;
mod touch_id;
mod usage_ping;

use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
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

fn validate_external_url(raw: &str) -> Result<String, String> {
    let url = raw.trim();
    if url.is_empty() || url.chars().any(|c| c.is_control()) {
        return Err("Enlace inválido".into());
    }
    let scheme = url.split(':').next().unwrap_or("").to_ascii_lowercase();
    match scheme.as_str() {
        "https" | "http" | "mailto" => Ok(url.to_string()),
        _ => Err("Solo se pueden abrir enlaces http, https o mailto".into()),
    }
}

/// Ruta relativa segura: sin `..`, sin absoluta. `max_components` = 1 archivo, 2 = carpeta/archivo.
fn safe_relative_path(name: &str, max_components: usize) -> Result<PathBuf, String> {
    let name = name.trim();
    if name.is_empty() || name.contains('\0') {
        return Err("Nombre de archivo inválido".into());
    }
    let path = Path::new(name);
    if path.is_absolute() {
        return Err("Nombre de archivo inválido".into());
    }
    let mut out = PathBuf::new();
    let mut count = 0usize;
    for comp in path.components() {
        match comp {
            Component::Normal(s) => {
                let s = s.to_string_lossy();
                if s == "." || s == ".." || s.is_empty() {
                    return Err("Nombre de archivo inválido".into());
                }
                count += 1;
                if count > max_components {
                    return Err("Nombre de archivo inválido".into());
                }
                out.push(s.as_ref());
            }
            Component::CurDir
            | Component::ParentDir
            | Component::Prefix(_)
            | Component::RootDir => {
                return Err("Nombre de archivo inválido".into());
            }
        }
    }
    if out.as_os_str().is_empty() {
        return Err("Nombre de archivo inválido".into());
    }
    Ok(out)
}

#[tauri::command]
fn open_external_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let url = validate_external_url(&url)?;
    app.shell()
        .open(url, None)
        .map_err(|e| format!("No se pudo abrir el enlace: {e}"))?;
    Ok(())
}

#[tauri::command]
async fn open_pdf_export(
    app: tauri::AppHandle,
    filename: String,
    data: Vec<u8>,
    destination: Option<String>,
) -> Result<(), String> {
    let dir = if destination.as_deref() == Some("desktop") {
        app.path().desktop_dir().or_else(|_| app.path().document_dir())
    } else {
        app.path().document_dir()
    }
    .map_err(|e| format!("No se pudo resolver la carpeta de destino: {e}"))?;
    let exports = if destination.as_deref() == Some("desktop") {
        dir
    } else {
        dir.join("Telar").join("exportaciones")
    };
    std::fs::create_dir_all(&exports)
        .map_err(|e| format!("No se pudo crear carpeta de exportaciones: {e}"))?;
    let path = exports.join(safe_relative_path(&filename, 1)?);
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
        .join(safe_relative_path(&folder_name, 1)?);
    std::fs::create_dir_all(&exports)
        .map_err(|e| format!("No se pudo crear carpeta de exportación: {e}"))?;
    for file in files {
        let path = exports.join(safe_relative_path(&file.name, 2)?);
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

#[tauri::command]
async fn save_calendar_export(
    app: tauri::AppHandle,
    filename: String,
    content: String,
    reveal: bool,
) -> Result<String, String> {
    let dir = app
        .path()
        .document_dir()
        .map_err(|e| format!("No se pudo resolver carpeta Documentos: {e}"))?;
    let calendar_dir = dir.join("Telar").join("calendario");
    std::fs::create_dir_all(&calendar_dir)
        .map_err(|e| format!("No se pudo crear carpeta de calendario: {e}"))?;
    let path = calendar_dir.join(safe_relative_path(&filename, 1)?);
    std::fs::write(&path, content.as_bytes())
        .map_err(|e| format!("No se pudo guardar calendario: {e}"))?;
    if reveal {
        app.shell()
            .open(calendar_dir.to_string_lossy().to_string(), None)
            .map_err(|e| format!("No se pudo abrir la carpeta de calendario: {e}"))?;
    }
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
async fn analyze_neurofeedback_session(
    app: tauri::AppHandle,
    text_data: String,
) -> Result<String, String> {
    if text_data.trim().is_empty() {
        return Err("Sin datos grabados".into());
    }
    match run_sidecar(&app, &text_data).await {
        Ok(out) => Ok(out),
        Err(sidecar_err) => run_python_script(&text_data).map_err(|py_err| {
            if py_err.contains("No se encontró el analizador") {
                sidecar_err
            } else {
                format!("{sidecar_err} (fallback: {py_err})")
            }
        }),
    }
}

async fn run_sidecar(app: &tauri::AppHandle, text_data: &str) -> Result<String, String> {
    let cache_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("No se pudo resolver caché: {e}"))?;
    std::fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("No se pudo crear caché: {e}"))?;
    let tmp = cache_dir.join(format!(
        "nf-{}.txt",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    std::fs::write(&tmp, text_data.as_bytes())
        .map_err(|e| format!("No se pudo escribir datos temporales: {e}"))?;
    let path_arg = tmp.to_string_lossy().to_string();

    let sidecar = app
        .shell()
        .sidecar("analyze_session")
        .map_err(|e| format!("Sidecar no disponible: {e}"))?;

    let (mut rx, _child) = sidecar
        .args(["--file", &path_arg])
        .spawn()
        .map_err(|e| format!("No se pudo iniciar sidecar: {e}"))?;

    let mut stdout = String::new();
    let mut stderr = String::new();
    let mut exit_ok = false;

    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => stdout.push_str(&String::from_utf8_lossy(&line)),
            CommandEvent::Stderr(line) => stderr.push_str(&String::from_utf8_lossy(&line)),
            CommandEvent::Terminated(payload) => {
                exit_ok = payload.code == Some(0);
            }
            _ => {}
        }
    }

    let _ = std::fs::remove_file(&tmp);

    if !exit_ok {
        return Err(format!(
            "Análisis falló: {}",
            if stderr.is_empty() { &stdout } else { &stderr }
        ));
    }

    let out = stdout.trim().to_string();
    if out.is_empty() {
        return Err("Sidecar no devolvió datos".to_string());
    }
    Ok(out)
}

fn run_python_script(text_data: &str) -> Result<String, String> {
    let script = resolve_python_script()?;
    let python = resolve_python_binary();

    let mut child = Command::new(&python)
        .arg(&script)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("No se pudo ejecutar Python ({python}): {e}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(text_data.as_bytes())
            .map_err(|e| format!("Error escribiendo datos a Python: {e}"))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("Error esperando análisis: {e}"))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Análisis falló: {err}"));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

use backup::{
    cloud_backup_folder_status, create_cloud_backup, has_backup_identity, import_backup_identity,
    preview_cloud_restore, purge_legacy_keychain_identity, restore_cloud_backup, setup_backup_identity,
    BackupCreateResult, BackupRestorePreview, CloudBackupFolderStatus,
};

#[tauri::command]
fn cloud_backup_setup_identity(app: tauri::AppHandle) -> Result<String, String> {
    setup_backup_identity(&app)
}

#[tauri::command]
fn cloud_backup_import_identity(app: tauri::AppHandle, recovery_key: String) -> Result<(), String> {
    import_backup_identity(&app, &recovery_key)
}

#[tauri::command]
fn cloud_backup_has_identity(app: tauri::AppHandle) -> bool {
    has_backup_identity(&app)
}

#[tauri::command]
fn cloud_backup_create(app: tauri::AppHandle, dest_dir: String) -> Result<BackupCreateResult, String> {
    create_cloud_backup(&app, PathBuf::from(dest_dir).as_path())
}

#[tauri::command]
fn cloud_backup_preview(
    app: tauri::AppHandle,
    backup_path: String,
    recovery_key: Option<String>,
) -> Result<BackupRestorePreview, String> {
    preview_cloud_restore(
        Some(&app),
        PathBuf::from(backup_path).as_path(),
        recovery_key.as_deref(),
    )
}

#[tauri::command]
fn cloud_backup_restore(
    app: tauri::AppHandle,
    backup_path: String,
    pin: String,
    recovery_key: Option<String>,
) -> Result<(), String> {
    restore_cloud_backup(
        &app,
        PathBuf::from(backup_path).as_path(),
        recovery_key.as_deref(),
        &pin,
    )
}

#[tauri::command]
fn cloud_backup_folder_status_cmd(dest_dir: String) -> CloudBackupFolderStatus {
    cloud_backup_folder_status(PathBuf::from(dest_dir).as_path())
}

// --- DB cifrada (PIN) ---
use secure_db::{
    db_execute, db_lock, db_select, db_status, db_unlock, db_unlock_touch_id, db_wipe_all_data,
    touch_id_available, touch_id_clear_stored_key, touch_id_has_stored_key, touch_id_prompt,
    touch_id_register_pin,
};

fn resolve_python_binary() -> String {
    if let Ok(p) = std::env::var("TELAR_PYTHON") {
        return p;
    }
    for candidate in ["python3", "python"] {
        if Command::new(candidate)
            .arg("--version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
        {
            return candidate.to_string();
        }
    }
    "python3".to_string()
}

fn resolve_python_script() -> Result<PathBuf, String> {
    if let Ok(p) = std::env::var("TELAR_ANALYZE_SCRIPT") {
        let path = PathBuf::from(p);
        if path.exists() {
            return Ok(path);
        }
    }

    let candidates = [
        PathBuf::from("python/analyze_session.py"),
        PathBuf::from("../python/analyze_session.py"),
    ];

    for c in candidates {
        if c.exists() {
            return Ok(c.canonicalize().unwrap_or(c));
        }
    }

    Err("No se encontró el analizador. Ejecuta: ./scripts/build-sidecar.sh".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            check_app_update,
            install_app_update,
            analyze_neurofeedback_session,
            muse_ble::muse_connect,
            muse_ble::muse_disconnect,
            muse_ble::muse_is_native_available,
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
            save_calendar_export,
            db_wipe_all_data,
            cloud_backup_setup_identity,
            cloud_backup_import_identity,
            cloud_backup_has_identity,
            cloud_backup_create,
            cloud_backup_preview,
            cloud_backup_restore,
            cloud_backup_folder_status_cmd,
            ai_api::ai_chat_completion,
            ai_api::ai_chat_cancel,
            ollama::ollama_status,
            ollama::ollama_ensure_running,
            ollama::ollama_pull_model,
            subscription_api::subscription_checkout,
            subscription_api::subscription_health,
            subscription_api::subscription_status,
            subscription_api::share_create,
            subscription_api::share_collect,
            subscription_api::share_revoke,
            subscription_api::share_notify_owner,
            desktop_notify::show_desktop_notification,
            usage_ping::usage_ping,
            packfile::pack_read,
            packfile::pack_write,
            packfile::codepen_zip_read,
            interactive::interactive_module_set,
            interactive::interactive_module_clear,
        ])
        .register_uri_scheme_protocol("telar-mod", |_ctx, request| {
            interactive::handle_request(request)
        })
        .setup(|app| {
            #[cfg(target_os = "macos")]
            touch_id::purge_legacy_keychain();
            // Entrada heredada en Keychain: borrarla sin leer evita el popup al abrir Ajustes.
            purge_legacy_keychain_identity();

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

#[cfg(test)]
mod tests {
    use super::{safe_relative_path, validate_external_url};
    use crate::subscription_api::validated_api_base;

    #[test]
    fn external_url_allows_http_https_mailto() {
        assert!(validate_external_url("https://ollama.com/download").is_ok());
        assert!(validate_external_url("https://www.mercadopago.cl/checkout?pref=1&x=2").is_ok());
        assert!(validate_external_url("http://127.0.0.1:5001/ok").is_ok());
        assert!(validate_external_url("mailto:soporte@telarapp.cl?subject=Hola").is_ok());
    }

    #[test]
    fn external_url_rejects_dangerous_schemes() {
        assert!(validate_external_url("javascript:alert(1)").is_err());
        assert!(validate_external_url("file:///etc/passwd").is_err());
        assert!(validate_external_url("data:text/html,hi").is_err());
        assert!(validate_external_url("https://evil.com\nfile:///tmp").is_err());
        assert!(validate_external_url("").is_err());
    }

    #[test]
    fn export_paths_allow_nested_nf_folder() {
        let p = safe_relative_path("neurofeedback_raw/grabacion-12.txt", 2).unwrap();
        assert_eq!(p, std::path::Path::new("neurofeedback_raw/grabacion-12.txt"));
        assert!(safe_relative_path("programa-tratamiento-María.pdf", 1).is_ok());
        assert!(safe_relative_path("datos-2026-08-28-1814", 1).is_ok());
    }

    #[test]
    fn export_paths_reject_traversal() {
        assert!(safe_relative_path("../secret.pdf", 1).is_err());
        assert!(safe_relative_path("a/../../etc/passwd", 2).is_err());
        assert!(safe_relative_path("/etc/passwd", 1).is_err());
        assert!(safe_relative_path("a/b/c.txt", 2).is_err());
        assert!(safe_relative_path("..", 1).is_err());
        assert!(safe_relative_path("", 1).is_err());
    }

    #[test]
    fn usage_api_base_allowlist() {
        assert!(validated_api_base("https://telar-api-aim8.onrender.com").is_ok());
        assert!(validated_api_base("https://telar-api-aim8.onrender.com/").is_ok());
        assert!(validated_api_base("http://127.0.0.1:5001").is_ok());
        assert!(validated_api_base("http://localhost:5001").is_ok());
        assert!(validated_api_base("https://evil.example").is_err());
        assert!(validated_api_base("http://169.254.169.254").is_err());
    }
}
