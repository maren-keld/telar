use serde_json::Value;

fn handle_ping_response(result: Result<ureq::Response, ureq::Error>, base: &str) -> Result<Value, String> {
    match result {
        Ok(response) => response
            .into_json()
            .map_err(|e| format!("Respuesta inválida: {e}")),
        Err(ureq::Error::Status(code, response)) => {
            let body: Value = response.into_json().unwrap_or(Value::Null);
            let msg = body
                .get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("Error en ping de uso");
            Err(format!("{msg} [HTTP {code}]"))
        }
        Err(e) => Err(format!(
            "No se pudo enviar ping de uso ({base}): {e}"
        )),
    }
}

/// Ping anónimo de apertura: solo versión de app; el servidor incrementa contador sin registrar IP.
#[tauri::command]
pub fn usage_ping(api_base: String, app_version: String) -> Result<Value, String> {
    let base = api_base.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("Falta apiBase".into());
    }
    let url = format!("{base}/api/usage/ping");
    let result = ureq::post(&url)
        .timeout(std::time::Duration::from_secs(4))
        .set("Content-Type", "application/json")
        .send_json(serde_json::json!({
            "app_version": app_version.trim(),
        }));
    handle_ping_response(result, base)
}
