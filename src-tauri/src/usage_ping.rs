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

/// Latido anónimo: id de dispositivo aleatorio, versión, plataforma y plan.
/// Sin datos clínicos ni identificadores del profesional; el servidor no guarda IP.
#[tauri::command]
pub fn usage_ping(api_base: String, payload: Value) -> Result<Value, String> {
    let base = api_base.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("Falta apiBase".into());
    }
    let url = format!("{base}/api/usage/ping");
    // Render free duerme tras 15 min; el arranque en frío puede tardar ~30 s.
    let result = ureq::post(&url)
        .timeout(std::time::Duration::from_secs(20))
        .set("Content-Type", "application/json")
        .send_json(payload);
    handle_ping_response(result, base)
}
