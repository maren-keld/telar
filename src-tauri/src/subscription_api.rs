use std::time::Duration;

use serde_json::Value;

const PRODUCTION_API_BASE: &str = "https://telar-api-aim8.onrender.com";
const HTTP_TIMEOUT: Duration = Duration::from_secs(5);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(2);

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout_connect(CONNECT_TIMEOUT)
        .timeout(HTTP_TIMEOUT)
        .build()
}

fn validated_api_base(api_base: &str) -> Result<String, String> {
    let base = api_base.trim().trim_end_matches('/');
    if base == PRODUCTION_API_BASE {
        return Ok(base.to_string());
    }
    // Local dev API — same machine only; used when Render is down or for checkout testing.
    if base == "http://127.0.0.1:5001" || base == "http://localhost:5001" {
        return Ok(base.to_string());
    }
    Err("Servidor de suscripciones no autorizado".into())
}

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
            "No se pudo conectar con la API ({base}). Detalle: {e}"
        )),
    }
}

#[tauri::command]
pub fn subscription_checkout(
    email: String,
    access_token: String,
    api_base: String,
) -> Result<Value, String> {
    let base = validated_api_base(&api_base)?;
    let url = format!("{base}/api/subscriptions/checkout");
    let result = agent()
        .post(&url)
        .set("Content-Type", "application/json")
        .send_json(serde_json::json!({
            "email": email,
            "access_token": access_token
        }));
    handle_response(result, &base, "No se pudo iniciar el pago")
}

#[tauri::command]
pub fn subscription_health(api_base: String) -> Result<Value, String> {
    let base = validated_api_base(&api_base)?;
    let url = format!("{base}/api/health");
    let result = agent().get(&url).call();
    handle_response(result, &base, "API de suscripciones no disponible")
}

#[tauri::command]
pub fn subscription_status(
    email: String,
    api_base: String,
    preapproval_id: Option<String>,
) -> Result<Value, String> {
    let base = validated_api_base(&api_base)?;
    let url = format!("{base}/api/subscriptions/status");
    let mut req = agent().get(&url).query("email", &email);
    if let Some(id) = preapproval_id.as_deref().filter(|s| !s.is_empty()) {
        req = req.query("preapproval_id", id);
    }
    handle_response(req.call(), &base, "No se pudo consultar la suscripción")
}
