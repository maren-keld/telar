use std::time::Duration;

use serde_json::{json, Value};

const CONNECT_TIMEOUT_SECS: u64 = 10;
/// Un modelo local recién cargado puede tardar minutos en emitir el primer token.
const LOCAL_READ_TIMEOUT_SECS: u64 = 600;
const REMOTE_READ_TIMEOUT_SECS: u64 = 180;

fn normalize_base(base: &str) -> Result<String, String> {
    let base = base.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("Falta URL base de la API".into());
    }
    Ok(base.to_string())
}

fn is_local_base(base: &str) -> bool {
    base.contains("127.0.0.1") || base.contains("localhost") || base.contains("[::1]")
}

fn agent_for(base: &str) -> ureq::Agent {
    let read_secs = if is_local_base(base) {
        LOCAL_READ_TIMEOUT_SECS
    } else {
        REMOTE_READ_TIMEOUT_SECS
    };
    ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(CONNECT_TIMEOUT_SECS))
        .timeout_read(Duration::from_secs(read_secs))
        .build()
}

fn api_error_message(body: &Value, fallback: &str) -> String {
    body.get("error")
        .and_then(|v| {
            v.as_str()
                .map(String::from)
                .or_else(|| v.get("message").and_then(|m| m.as_str()).map(String::from))
        })
        .unwrap_or_else(|| fallback.to_string())
}

fn transport_error_message(base: &str, detail: &str) -> String {
    let local = is_local_base(base);
    let timed_out = detail.contains("timed out") || detail.contains("timeout");

    if local && timed_out {
        return "El modelo local tardó demasiado en responder. Prueba un modelo más ligero (Qwen 2.5 3B) o vuelve a consultar: la primera respuesta tras abrir Ollama es la más lenta.".into();
    }
    if local {
        return format!(
            "No se pudo conectar con Ollama en {base}. Abre Ollama y comprueba que el modelo esté descargado en Ajustes → Asistente IA. Detalle: {detail}"
        );
    }
    if timed_out {
        return format!("La API de IA no respondió a tiempo. Detalle: {detail}");
    }
    format!(
        "No se pudo conectar con la API de IA. Comprueba la URL, la clave y que el servicio esté activo. Detalle: {detail}"
    )
}

fn handle_response(
    result: Result<ureq::Response, ureq::Error>,
    base: &str,
    fallback: &str,
) -> Result<Value, String> {
    match result {
        Ok(response) => response
            .into_json()
            .map_err(|e| format!("Respuesta inválida de la API de IA: {e}")),
        Err(ureq::Error::Status(code, response)) => {
            let body: Value = response.into_json().unwrap_or(Value::Null);
            let msg = api_error_message(&body, fallback);
            if code == 404 && is_local_base(base) {
                return Err(format!(
                    "Ollama no reconoce ese modelo [HTTP 404]. Descárgalo en Ajustes → Asistente IA → Descargar / actualizar modelo. Detalle: {msg}"
                ));
            }
            Err(format!("{msg} [HTTP {code}]"))
        }
        Err(e) => Err(transport_error_message(base, &e.to_string())),
    }
}

fn chat_completion_blocking(
    api_base: String,
    api_key: String,
    model: String,
    messages: Value,
    max_tokens: u32,
) -> Result<Value, String> {
    let base = normalize_base(&api_base)?;
    let model = model.trim();
    if model.is_empty() {
        return Err("Falta nombre del modelo".into());
    }

    let url = format!("{base}/chat/completions");
    let mut req = agent_for(&base)
        .post(&url)
        .set("Content-Type", "application/json");

    let key = api_key.trim();
    if !key.is_empty() {
        req = req.set("Authorization", &format!("Bearer {key}"));
    }

    let result = req.send_json(json!({
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
    }));

    handle_response(result, &base, "La API de IA rechazó la solicitud")
}

/// OpenAI-compatible `POST /chat/completions` (Mistral, Ollama, OpenRouter, etc.).
///
/// Async + `spawn_blocking`: un comando síncrono correría en el hilo principal y
/// congelaría la ventana durante toda la espera (minutos con modelos locales).
#[tauri::command]
pub async fn ai_chat_completion(
    api_base: String,
    api_key: String,
    model: String,
    messages: Value,
    max_tokens: Option<u32>,
) -> Result<Value, String> {
    let max_tokens = max_tokens.unwrap_or(512);
    tauri::async_runtime::spawn_blocking(move || {
        chat_completion_blocking(api_base, api_key, model, messages, max_tokens)
    })
    .await
    .map_err(|e| format!("Error interno al consultar la IA: {e}"))?
}
