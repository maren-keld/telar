use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

use serde::Deserialize;

mod muse_ble;
mod secure_db;
mod subscription_api;
mod touch_id;

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

#[tauri::command]
async fn analyze_neurofeedback_session(
    app: tauri::AppHandle,
    text_data: String,
) -> Result<String, String> {
    if let Ok(out) = run_sidecar(&app, &text_data).await {
        return Ok(out);
    }
    run_python_script(&text_data)
}

async fn run_sidecar(app: &tauri::AppHandle, text_data: &str) -> Result<String, String> {
    let sidecar = app
        .shell()
        .sidecar("analyze_session")
        .map_err(|e| format!("Sidecar no disponible: {e}"))?;

    // Spawn without --file: Python falls back to sys.stdin.read().
    // Sending data via stdin avoids writing PHI to /tmp.
    let (mut rx, mut child) = sidecar
        .spawn()
        .map_err(|e| format!("No se pudo iniciar sidecar: {e}"))?;

    // Send data via stdin; dropping child closes the pipe (EOF signals end of input).
    child
        .write(text_data.as_bytes())
        .map_err(|e| format!("Error enviando datos al sidecar: {e}"))?;

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
            db_wipe_all_data,
            db_backup_encrypted,
            subscription_api::subscription_checkout,
            subscription_api::subscription_status,
        ])
        .setup(|app| {
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
