use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

const OLLAMA_BASE: &str = "http://127.0.0.1:11434";
const PING_TIMEOUT_SECS: u64 = 3;
/// La descarga llega en chunks; el timeout es por lectura, no por descarga total.
const PULL_READ_TIMEOUT_SECS: u64 = 120;

fn ping_agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(PING_TIMEOUT_SECS))
        .timeout_read(Duration::from_secs(PING_TIMEOUT_SECS))
        .build()
}

fn pull_agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(PING_TIMEOUT_SECS))
        .timeout_read(Duration::from_secs(PULL_READ_TIMEOUT_SECS))
        .build()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaStatus {
    pub running: bool,
    pub models: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OllamaPullResult {
    pub model: String,
    pub already_present: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct OllamaPullProgress {
    status: String,
    completed: Option<u64>,
    total: Option<u64>,
    percent: Option<u8>,
}

fn ollama_ping() -> bool {
    ping_agent()
        .get(&format!("{OLLAMA_BASE}/api/tags"))
        .call()
        .is_ok()
}

fn list_models() -> Vec<String> {
    let Ok(response) = ping_agent().get(&format!("{OLLAMA_BASE}/api/tags")).call() else {
        return vec![];
    };
    let Ok(body): Result<Value, _> = response.into_json() else {
        return vec![];
    };
    body.get("models")
        .and_then(|m| m.as_array())
        .map(|models| {
            models
                .iter()
                .filter_map(|m| m.get("name").and_then(|n| n.as_str()).map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

fn model_installed(name: &str, models: &[String]) -> bool {
    models.iter().any(|m| m == name || m.starts_with(&format!("{name}:")))
}

#[cfg(target_os = "macos")]
fn try_start_ollama() -> Result<(), String> {
    if Command::new("open")
        .args(["-g", "-a", "Ollama"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
    {
        return Ok(());
    }

    Command::new("ollama")
        .arg("serve")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|_| OLLAMA_INSTALL_HINT.into())
}

#[cfg(target_os = "windows")]
fn try_start_ollama() -> Result<(), String> {
    let local_app = std::env::var("LOCALAPPDATA").ok();
    let mut candidates: Vec<String> = vec!["ollama".into()];
    if let Some(base) = local_app {
        candidates.push(format!("{base}\\Programs\\Ollama\\ollama.exe"));
    }

    for exe in candidates {
        if Command::new(&exe)
            .arg("serve")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .is_ok()
        {
            return Ok(());
        }
    }

    Err(OLLAMA_INSTALL_HINT.into())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn try_start_ollama() -> Result<(), String> {
    Command::new("ollama")
        .arg("serve")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|_| OLLAMA_INSTALL_HINT.into())
}

const OLLAMA_INSTALL_HINT: &str =
    "Instala Ollama desde ollama.com/download y vuelve a intentar la descarga.";

const OLLAMA_START_TIMEOUT: &str =
    "Ollama no respondió. Abre Ollama manualmente, espera a que arranque e inténtalo de nuevo.";

fn ensure_ollama_running() -> Result<(), String> {
    if ollama_ping() {
        return Ok(());
    }

    try_start_ollama()?;

    for _ in 0..45 {
        thread::sleep(Duration::from_secs(1));
        if ollama_ping() {
            return Ok(());
        }
    }

    Err(OLLAMA_START_TIMEOUT.into())
}

fn emit_progress(app: &AppHandle, status: &str, completed: Option<u64>, total: Option<u64>) {
    let percent = match (completed, total) {
        (Some(c), Some(t)) if t > 0 => Some(((c as f64 / t as f64) * 100.0).min(100.0) as u8),
        _ => None,
    };
    let _ = app.emit(
        "ollama-pull-progress",
        OllamaPullProgress {
            status: status.to_string(),
            completed,
            total,
            percent,
        },
    );
}

fn pull_model_blocking(app: &AppHandle, model: &str) -> Result<(), String> {
    let response = pull_agent()
        .post(&format!("{OLLAMA_BASE}/api/pull"))
        .set("Content-Type", "application/json")
        .send_json(json!({ "name": model, "stream": true }))
        .map_err(|e| format!("No se pudo iniciar la descarga en Ollama: {e}"))?;

    let reader = BufReader::new(response.into_reader());
    let mut last_status = String::new();

    for line in reader.lines() {
        let line = line.map_err(|e| format!("Error leyendo progreso de Ollama: {e}"))?;
        if line.trim().is_empty() {
            continue;
        }

        let payload: Value =
            serde_json::from_str(&line).map_err(|e| format!("Respuesta inválida de Ollama: {e}"))?;

        let status = payload
            .get("status")
            .and_then(|s| s.as_str())
            .unwrap_or("")
            .to_string();
        last_status = status.clone();

        let completed = payload.get("completed").and_then(|v| v.as_u64());
        let total = payload.get("total").and_then(|v| v.as_u64());
        emit_progress(app, &status, completed, total);

        if status == "success" {
            return Ok(());
        }
    }

    if last_status == "success" {
        Ok(())
    } else {
        Err(format!(
            "La descarga terminó con estado inesperado: {}",
            if last_status.is_empty() {
                "desconocido"
            } else {
                &last_status
            }
        ))
    }
}

/// Arranca Ollama.app / `ollama serve` si el puerto 11434 no responde.
#[tauri::command]
pub async fn ollama_ensure_running() -> Result<OllamaStatus, String> {
    tauri::async_runtime::spawn_blocking(|| {
        ensure_ollama_running()?;
        Ok(OllamaStatus {
            running: true,
            models: list_models(),
        })
    })
    .await
    .map_err(|e| format!("Error interno al arrancar Ollama: {e}"))?
}

/// Async para no bloquear el hilo principal: hace I/O de red.
#[tauri::command]
pub async fn ollama_status() -> Result<OllamaStatus, String> {
    tauri::async_runtime::spawn_blocking(|| {
        if !ollama_ping() {
            return OllamaStatus {
                running: false,
                models: vec![],
            };
        }
        OllamaStatus {
            running: true,
            models: list_models(),
        }
    })
    .await
    .map_err(|e| format!("Error interno al consultar Ollama: {e}"))
}

#[tauri::command]
pub async fn ollama_pull_model(app: AppHandle, model: String) -> Result<OllamaPullResult, String> {
    let model = model.trim().to_string();
    if model.is_empty() {
        return Err("Falta nombre del modelo".into());
    }

    tauri::async_runtime::spawn_blocking(move || {
        ensure_ollama_running()?;

        let installed = list_models();
        if model_installed(&model, &installed) {
            emit_progress(&app, "success", None, None);
            return Ok(OllamaPullResult {
                model,
                already_present: true,
            });
        }

        pull_model_blocking(&app, &model)?;
        Ok(OllamaPullResult {
            model,
            already_present: false,
        })
    })
    .await
    .map_err(|e| format!("Error interno al descargar modelo: {e}"))?
}
