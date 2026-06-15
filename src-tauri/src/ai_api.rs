use serde_json::{json, Value};

fn normalize_base(base: &str) -> Result<String, String> {
    let base = base.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("Falta URL base de la API".into());
    }
    Ok(base.to_string())
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

fn handle_response(
    result: Result<ureq::Response, ureq::Error>,
    fallback: &str,
) -> Result<Value, String> {
    match result {
        Ok(response) => response
            .into_json()
            .map_err(|e| format!("Respuesta inválida de la API de IA: {e}")),
        Err(ureq::Error::Status(code, response)) => {
            let body: Value = response.into_json().unwrap_or(Value::Null);
            Err(format!(
                "{} [HTTP {code}]",
                api_error_message(&body, fallback)
            ))
        }
        Err(e) => Err(format!(
            "No se pudo conectar con la API de IA. Comprueba la URL, la clave y que el servicio esté activo. Detalle: {e}"
        )),
    }
}

/// OpenAI-compatible `POST /chat/completions` (Mistral, Ollama, OpenRouter, etc.).
#[tauri::command]
pub fn ai_chat_completion(
    api_base: String,
    api_key: String,
    model: String,
    messages: Value,
    max_tokens: Option<u32>,
) -> Result<Value, String> {
    let base = normalize_base(&api_base)?;
    let model = model.trim();
    if model.is_empty() {
        return Err("Falta nombre del modelo".into());
    }

    let url = format!("{base}/chat/completions");
    let max_tokens = max_tokens.unwrap_or(512);

    let mut req = ureq::post(&url).set("Content-Type", "application/json");
    let key = api_key.trim();
    if !key.is_empty() {
        req = req.set("Authorization", &format!("Bearer {key}"));
    }

    let result = req.send_json(json!({
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
    }));

    handle_response(result, "La API de IA rechazó la solicitud")
}
