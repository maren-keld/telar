use std::thread;
use std::time::Duration;

use serde_json::Value;

use crate::subscription_api::validated_api_base;

fn send_ping(base: &str, payload: Value) {
    let url = format!("{base}/api/usage/ping");
    // Sin red, un timeout largo bloqueaba el IPC y sacaba el cursor arcoíris ~20 s.
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(2))
        .timeout(Duration::from_secs(3))
        .build();
    let _ = agent
        .post(&url)
        .set("Content-Type", "application/json")
        .send_json(payload);
}

/// Latido anónimo: id de dispositivo aleatorio, versión, plataforma y plan.
/// Sin datos clínicos ni identificadores del profesional; el servidor no guarda IP.
/// Vuelve al instante: el POST corre en un hilo para no congelar la UI sin internet.
#[tauri::command]
pub fn usage_ping(api_base: String, payload: Value) -> Result<Value, String> {
    let base = validated_api_base(&api_base)?;
    thread::spawn(move || send_ping(&base, payload));
    Ok(serde_json::json!({ "ok": true, "queued": true }))
}
