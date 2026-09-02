use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use futures::StreamExt;
use once_cell::sync::Lazy;
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use serde_json::{json, Value};

const CONNECT_TIMEOUT_SECS: u64 = 10;
/// Un modelo local recién cargado puede tardar minutos en emitir el primer token.
const LOCAL_READ_TIMEOUT_SECS: u64 = 600;
const REMOTE_READ_TIMEOUT_SECS: u64 = 180;

/// Ids de solicitud cancelados: `cancel(id)` marca todos los ids ≤ id.
static CANCELLED_ID: AtomicU64 = AtomicU64::new(0);

static HTTP: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(CONNECT_TIMEOUT_SECS))
        .build()
        .expect("cliente HTTP de IA")
});

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
    let timed_out = detail.contains("timed out")
        || detail.contains("timeout")
        || detail.contains("elapsed");

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

fn is_cancelled(request_id: u64) -> bool {
    request_id != 0 && CANCELLED_ID.load(Ordering::SeqCst) >= request_id
}

async fn wait_until_cancelled(request_id: u64) {
    if request_id == 0 {
        std::future::pending::<()>().await;
        return;
    }
    loop {
        if is_cancelled(request_id) {
            return;
        }
        tokio::time::sleep(Duration::from_millis(40)).await;
    }
}

fn chat_message_value(content: &str) -> Value {
    json!({
        "choices": [{
            "message": {
                "role": "assistant",
                "content": content,
            },
            "finish_reason": "stop"
        }]
    })
}

/// Consume eventos SSE completos. Devuelve `true` al ver `data: [DONE]`.
fn consume_sse_events(buffer: &mut String, content: &mut String) -> Result<bool, String> {
    loop {
        let crlf = buffer.find("\r\n\r\n");
        let lf = buffer.find("\n\n");
        let (idx, sep_len) = match (crlf, lf) {
            (Some(a), Some(b)) if a <= b => (a, 4),
            (Some(a), None) => (a, 4),
            (None, Some(b)) => (b, 2),
            (Some(_), Some(b)) => (b, 2),
            (None, None) => return Ok(false),
        };
        let event = buffer[..idx].replace('\r', "");
        buffer.drain(..idx + sep_len);
        for line in event.lines() {
            let Some(data) = line.strip_prefix("data:") else {
                continue;
            };
            let data = data.trim();
            if data.is_empty() {
                continue;
            }
            if data == "[DONE]" {
                return Ok(true);
            }
            let Ok(v) = serde_json::from_str::<Value>(data) else {
                continue;
            };
            if v.get("error").is_some() {
                return Err(api_error_message(&v, "La API de IA rechazó la solicitud"));
            }
            let delta = v
                .pointer("/choices/0/delta/content")
                .or_else(|| v.pointer("/choices/0/message/content"))
                .and_then(|x| x.as_str());
            if let Some(s) = delta {
                content.push_str(s);
            }
        }
    }
}

async fn stream_chat_completion(
    api_base: String,
    api_key: String,
    model: String,
    messages: Value,
    max_tokens: u32,
    request_id: u64,
) -> Result<Value, String> {
    if is_cancelled(request_id) {
        return Err("cancelado".into());
    }

    let base = normalize_base(&api_base)?;
    let model = model.trim();
    if model.is_empty() {
        return Err("Falta nombre del modelo".into());
    }

    let url = format!("{base}/chat/completions");
    let idle = Duration::from_secs(if is_local_base(&base) {
        LOCAL_READ_TIMEOUT_SECS
    } else {
        REMOTE_READ_TIMEOUT_SECS
    });

    let mut req = HTTP.post(&url).header(CONTENT_TYPE, "application/json");
    let key = api_key.trim();
    if !key.is_empty() {
        req = req.header(AUTHORIZATION, format!("Bearer {key}"));
    }

    let send = req.json(&json!({
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "stream": true,
    }));

    let response = tokio::select! {
        biased;
        _ = wait_until_cancelled(request_id) => {
            return Err("cancelado".into());
        }
        result = send.send() => {
            result.map_err(|e| transport_error_message(&base, &e.to_string()))?
        }
    };

    if is_cancelled(request_id) {
        return Err("cancelado".into());
    }

    let status = response.status();
    let ctype = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    if !status.is_success() {
        let body: Value = response.json().await.unwrap_or(Value::Null);
        let msg = api_error_message(&body, "La API de IA rechazó la solicitud");
        let code = status.as_u16();
        if code == 404 && is_local_base(&base) {
            return Err(format!(
                "Ollama no reconoce ese modelo [HTTP 404]. Descárgalo en Ajustes → Asistente IA → Descargar / actualizar modelo. Detalle: {msg}"
            ));
        }
        return Err(format!("{msg} [HTTP {code}]"));
    }

    if ctype.contains("application/json") && !ctype.contains("event-stream") {
        return response
            .json()
            .await
            .map_err(|e| format!("Respuesta inválida de la API de IA: {e}"));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut content = String::new();

    loop {
        if is_cancelled(request_id) {
            return Err("cancelado".into());
        }
        tokio::select! {
            biased;
            _ = wait_until_cancelled(request_id) => {
                // Al salir se dropea `stream` y se cierra el socket: Ollama para.
                return Err("cancelado".into());
            }
            next = tokio::time::timeout(idle, stream.next()) => {
                match next {
                    Err(_) => {
                        return Err(transport_error_message(
                            &base,
                            "timed out waiting for next token",
                        ));
                    }
                    Ok(None) => break,
                    Ok(Some(Err(e))) => {
                        if is_cancelled(request_id) {
                            return Err("cancelado".into());
                        }
                        return Err(transport_error_message(&base, &e.to_string()));
                    }
                    Ok(Some(Ok(bytes))) => {
                        buffer.push_str(&String::from_utf8_lossy(&bytes));
                        if consume_sse_events(&mut buffer, &mut content)? {
                            break;
                        }
                    }
                }
            }
        }
    }

    if is_cancelled(request_id) {
        return Err("cancelado".into());
    }

    Ok(chat_message_value(&content))
}

/* --------------------------- Anthropic (Messages) -------------------------- */

/// Anthropic no habla OpenAI: el system prompt va aparte y el streaming usa
/// eventos `content_block_delta`. Se normaliza la salida al mismo `choices[0]`
/// que espera `ai-client.js` para no tocar el resto de la app.
fn anthropic_payload(messages: &Value, model: &str, max_tokens: u32) -> (Value, Vec<Value>) {
    let mut system = String::new();
    let mut turns = Vec::new();
    for msg in messages.as_array().cloned().unwrap_or_default() {
        let role = msg.get("role").and_then(|r| r.as_str()).unwrap_or("user");
        let content = msg.get("content").and_then(|c| c.as_str()).unwrap_or("");
        if role == "system" {
            if !system.is_empty() {
                system.push_str("\n\n");
            }
            system.push_str(content);
            continue;
        }
        turns.push(json!({ "role": if role == "assistant" { "assistant" } else { "user" }, "content": content }));
    }
    if turns.is_empty() {
        turns.push(json!({ "role": "user", "content": "" }));
    }
    let mut body = json!({
        "model": model,
        "max_tokens": max_tokens,
        "messages": turns.clone(),
        "stream": true,
    });
    if !system.is_empty() {
        body["system"] = Value::String(system);
    }
    (body, turns)
}

/// Igual que `consume_sse_events` pero para el formato de Anthropic.
fn consume_anthropic_events(buffer: &mut String, content: &mut String) -> Result<bool, String> {
    loop {
        let crlf = buffer.find("\r\n\r\n");
        let lf = buffer.find("\n\n");
        let (idx, sep_len) = match (crlf, lf) {
            (Some(a), Some(b)) if a <= b => (a, 4),
            (Some(a), None) => (a, 4),
            (None, Some(b)) => (b, 2),
            (Some(_), Some(b)) => (b, 2),
            (None, None) => return Ok(false),
        };
        let event = buffer[..idx].replace('\r', "");
        buffer.drain(..idx + sep_len);
        for line in event.lines() {
            let Some(data) = line.strip_prefix("data:") else {
                continue;
            };
            let data = data.trim();
            if data.is_empty() {
                continue;
            }
            let Ok(v) = serde_json::from_str::<Value>(data) else {
                continue;
            };
            match v.get("type").and_then(|t| t.as_str()) {
                Some("content_block_delta") => {
                    if let Some(s) = v.pointer("/delta/text").and_then(|x| x.as_str()) {
                        content.push_str(s);
                    }
                }
                Some("message_stop") => return Ok(true),
                Some("error") => {
                    return Err(api_error_message(&v, "La API de Anthropic rechazó la solicitud"))
                }
                _ => {}
            }
        }
    }
}

async fn stream_anthropic_completion(
    api_base: String,
    api_key: String,
    model: String,
    messages: Value,
    max_tokens: u32,
    request_id: u64,
) -> Result<Value, String> {
    if is_cancelled(request_id) {
        return Err("cancelado".into());
    }
    let base = normalize_base(&api_base)?;
    let model = model.trim();
    if model.is_empty() {
        return Err("Falta nombre del modelo".into());
    }
    let key = api_key.trim();
    if key.is_empty() {
        return Err("Anthropic necesita una clave API (x-api-key).".into());
    }

    let (body, _) = anthropic_payload(&messages, model, max_tokens);
    let send = HTTP
        .post(format!("{base}/messages"))
        .header(CONTENT_TYPE, "application/json")
        .header("x-api-key", key)
        .header("anthropic-version", "2023-06-01")
        .json(&body);

    let response = tokio::select! {
        biased;
        _ = wait_until_cancelled(request_id) => return Err("cancelado".into()),
        result = send.send() => result.map_err(|e| transport_error_message(&base, &e.to_string()))?,
    };

    let status = response.status();
    if !status.is_success() {
        let body: Value = response.json().await.unwrap_or(Value::Null);
        let msg = api_error_message(&body, "La API de Anthropic rechazó la solicitud");
        return Err(format!("{msg} [HTTP {}]", status.as_u16()));
    }

    let idle = Duration::from_secs(REMOTE_READ_TIMEOUT_SECS);
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut content = String::new();

    loop {
        if is_cancelled(request_id) {
            return Err("cancelado".into());
        }
        tokio::select! {
            biased;
            _ = wait_until_cancelled(request_id) => return Err("cancelado".into()),
            next = tokio::time::timeout(idle, stream.next()) => {
                match next {
                    Err(_) => return Err(transport_error_message(&base, "timed out waiting for next token")),
                    Ok(None) => break,
                    Ok(Some(Err(e))) => {
                        if is_cancelled(request_id) {
                            return Err("cancelado".into());
                        }
                        return Err(transport_error_message(&base, &e.to_string()));
                    }
                    Ok(Some(Ok(bytes))) => {
                        buffer.push_str(&String::from_utf8_lossy(&bytes));
                        if consume_anthropic_events(&mut buffer, &mut content)? {
                            break;
                        }
                    }
                }
            }
        }
    }

    if is_cancelled(request_id) {
        return Err("cancelado".into());
    }
    Ok(chat_message_value(&content))
}

/// Corta la generación en curso: el lector SSE cierra el socket (Ollama para).
#[tauri::command]
pub fn ai_chat_cancel(request_id: u64) {
    if request_id == 0 {
        return;
    }
    CANCELLED_ID.fetch_max(request_id, Ordering::SeqCst);
}

/// OpenAI-compatible `POST /chat/completions` en streaming SSE.
///
/// Sin stream, el POST bloquea hasta el último token y no se puede abortar.
#[tauri::command]
pub async fn ai_chat_completion(
    api_base: String,
    api_key: String,
    model: String,
    messages: Value,
    max_tokens: Option<u32>,
    request_id: Option<u64>,
    provider: Option<String>,
) -> Result<Value, String> {
    let max_tokens = max_tokens.unwrap_or(512);
    let request_id = request_id.unwrap_or(0);
    if provider.as_deref() == Some("anthropic") {
        return stream_anthropic_completion(
            api_base, api_key, model, messages, max_tokens, request_id,
        )
        .await;
    }
    stream_chat_completion(api_base, api_key, model, messages, max_tokens, request_id).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sse_accumulates_delta_content() {
        let mut buf = String::from(
            "data: {\"choices\":[{\"delta\":{\"content\":\"Hola\"}}]}\n\n\
             data: {\"choices\":[{\"delta\":{\"content\":\" mundo\"}}]}\n\n\
             data: [DONE]\n\n",
        );
        let mut content = String::new();
        assert!(consume_sse_events(&mut buf, &mut content).unwrap());
        assert_eq!(content, "Hola mundo");
        assert!(buf.is_empty());
    }

    #[test]
    fn anthropic_splits_system_from_turns() {
        let messages = json!([
            { "role": "system", "content": "Eres útil" },
            { "role": "user", "content": "Hola" },
            { "role": "assistant", "content": "Hey" },
        ]);
        let (body, turns) = anthropic_payload(&messages, "claude-x", 900);
        assert_eq!(body["system"], "Eres útil");
        assert_eq!(body["max_tokens"], 900);
        assert_eq!(turns.len(), 2);
        assert_eq!(turns[0]["role"], "user");
        assert_eq!(turns[1]["role"], "assistant");
    }

    #[test]
    fn anthropic_sse_accumulates_text_and_stops() {
        let mut buf = String::from(
            "event: content_block_delta\n\
             data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"Hola\"}}\n\n\
             data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\" mundo\"}}\n\n\
             data: {\"type\":\"message_stop\"}\n\n",
        );
        let mut content = String::new();
        assert!(consume_anthropic_events(&mut buf, &mut content).unwrap());
        assert_eq!(content, "Hola mundo");
    }

    #[test]
    fn anthropic_sse_surfaces_errors() {
        let mut buf = String::from(
            "data: {\"type\":\"error\",\"error\":{\"message\":\"clave inválida\"}}\n\n",
        );
        let mut content = String::new();
        let err = consume_anthropic_events(&mut buf, &mut content).unwrap_err();
        assert!(err.contains("clave inválida"));
    }

    #[test]
    fn sse_waits_for_complete_event() {
        let mut buf = String::from("data: {\"choices\":[{\"delta\":{\"content\":\"x\"}}]}\n");
        let mut content = String::new();
        assert!(!consume_sse_events(&mut buf, &mut content).unwrap());
        assert!(content.is_empty());
        buf.push_str("\n");
        assert!(!consume_sse_events(&mut buf, &mut content).unwrap());
        assert_eq!(content, "x");
    }
}
