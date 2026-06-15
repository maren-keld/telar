use serde_json::Value;

fn api_error_message(body: &Value, fallback: &str) -> String {
    body.get("error")
        .and_then(|v| v.as_str())
        .unwrap_or(fallback)
        .to_string()
}

/// Convierte el resultado de ureq en JSON, extrayendo el mensaje de error
/// del cuerpo cuando la API responde 4xx/5xx (ureq los trata como Err).
fn handle_response(
    result: Result<ureq::Response, ureq::Error>,
    base: &str,
    fallback: &str,
) -> Result<Value, String> {
    match result {
        Ok(response) => response
            .into_json()
            .map_err(|e| format!("Respuesta inválida de la API: {e}")),
        Err(ureq::Error::Status(code, response)) => {
            let body: Value = response.into_json().unwrap_or(Value::Null);
            let detail = body
                .get("detail")
                .and_then(|d| d.get("message"))
                .and_then(|m| m.as_str())
                .map(|m| format!(" ({m})"))
                .unwrap_or_default();
            Err(format!(
                "{}{} [HTTP {code}]",
                api_error_message(&body, fallback),
                detail
            ))
        }
        Err(e) => Err(format!(
            "No se pudo conectar con la API ({base}). ¿Está corriendo «python app.py» en server/? Detalle: {e}"
        )),
    }
}

#[tauri::command]
pub fn subscription_checkout(email: String, api_base: String) -> Result<Value, String> {
    let base = api_base.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("Falta apiBase (URL de la API de suscripciones)".into());
    }
    let url = format!("{base}/api/subscriptions/checkout");
    let result = ureq::post(&url)
        .set("Content-Type", "application/json")
        .send_json(serde_json::json!({ "email": email }));
    handle_response(result, base, "No se pudo iniciar el pago")
}

#[tauri::command]
pub fn subscription_health(api_base: String) -> Result<Value, String> {
    let base = api_base.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("Falta apiBase".into());
    }
    let url = format!("{base}/api/health");
    let result = ureq::get(&url).call();
    handle_response(result, base, "API de suscripciones no disponible")
}

#[tauri::command]
pub fn subscription_dev_activate(email: String, api_base: String) -> Result<Value, String> {
    let base = api_base.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("Falta apiBase".into());
    }
    let url = format!("{base}/api/subscriptions/dev-activate");
    let result = ureq::post(&url)
        .set("Content-Type", "application/json")
        .send_json(serde_json::json!({ "email": email }));
    handle_response(result, base, "No se pudo activar Pro en desarrollo")
}

#[tauri::command]
pub fn subscription_status(email: String, api_base: String) -> Result<Value, String> {
    let base = api_base.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("Falta apiBase".into());
    }
    let url = format!("{base}/api/subscriptions/status?email={}", urlencoding_simple(&email));
    let result = ureq::get(&url).call();
    handle_response(result, base, "No se pudo consultar la suscripción")
}

fn urlencoding_simple(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'@' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}
