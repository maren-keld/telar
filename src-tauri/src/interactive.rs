//! Esquema `telar-mod://` para las experiencias interactivas.
//!
//! El HTML lo escribe el terapeuta (o viene de un pack) y suele traer scripts
//! inline, que la CSP de la app prohíbe. Servirlo desde un esquema propio le da
//! un origen aparte con su propia CSP: sin red y sin acceso al DOM de Telar.
//! El documento se registra desde el front (`interactive_module_set`) justo
//! antes de apuntar el iframe, y se borra al desmontar el módulo.

use std::collections::HashMap;
use std::sync::Mutex;

use once_cell::sync::Lazy;
use tauri::http::{Request, Response};

/// Documentos vivos por id (`<customId>-<moduleId>`). Solo lo abierto en pantalla.
static DOCS: Lazy<Mutex<HashMap<String, String>>> = Lazy::new(|| Mutex::new(HashMap::new()));

const MAX_DOC_BYTES: usize = 4 * 1024 * 1024;
const MAX_DOCS: usize = 16;

#[tauri::command]
pub fn interactive_module_set(id: String, html: String) -> Result<(), String> {
    if id.trim().is_empty() {
        return Err("Falta el id del módulo".into());
    }
    if html.len() > MAX_DOC_BYTES {
        return Err("La experiencia interactiva es demasiado grande (máximo 4 MB).".into());
    }
    let mut docs = DOCS.lock().map_err(|_| "Estado bloqueado".to_string())?;
    if docs.len() >= MAX_DOCS && !docs.contains_key(&id) {
        docs.clear();
    }
    docs.insert(id, html);
    Ok(())
}

#[tauri::command]
pub fn interactive_module_clear(id: String) -> Result<(), String> {
    let mut docs = DOCS.lock().map_err(|_| "Estado bloqueado".to_string())?;
    docs.remove(&id);
    Ok(())
}

/// El id viaja en el path. macOS/Linux dan `telar-mod://localhost/<id>`,
/// Windows `http://telar-mod.localhost/<id>`; en ambos casos basta el path.
fn doc_id_from_uri(uri: &str) -> Option<String> {
    let after_scheme = uri.split("://").nth(1)?;
    let path = after_scheme.split('/').nth(1)?;
    let path = path.split('?').next()?.split('#').next()?;
    if path.is_empty() {
        return None;
    }
    Some(percent_decode(path))
}

fn percent_decode(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
            if let Ok(byte) = u8::from_str_radix(hex, 16) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

pub fn handle_request(request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    let not_found = |msg: &str| {
        Response::builder()
            .status(404)
            .header("Content-Type", "text/plain; charset=utf-8")
            .body(msg.as_bytes().to_vec())
            .unwrap_or_else(|_| Response::new(Vec::new()))
    };

    let Some(id) = doc_id_from_uri(&request.uri().to_string()) else {
        return not_found("Módulo no encontrado");
    };
    let html = {
        let Ok(docs) = DOCS.lock() else {
            return not_found("Módulo no disponible");
        };
        docs.get(&id).cloned()
    };
    let Some(html) = html else {
        return not_found("Módulo no encontrado");
    };

    Response::builder()
        .status(200)
        .header("Content-Type", "text/html; charset=utf-8")
        .header("Cache-Control", "no-store")
        .header("X-Content-Type-Options", "nosniff")
        .body(html.into_bytes())
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ids_from_both_platform_urls() {
        assert_eq!(
            doc_id_from_uri("telar-mod://localhost/abc-12").as_deref(),
            Some("abc-12")
        );
        assert_eq!(
            doc_id_from_uri("http://telar-mod.localhost/abc-12").as_deref(),
            Some("abc-12")
        );
        assert_eq!(
            doc_id_from_uri("telar-mod://localhost/abc-12?v=1#top").as_deref(),
            Some("abc-12")
        );
        assert_eq!(
            doc_id_from_uri("telar-mod://localhost/m%20a").as_deref(),
            Some("m a")
        );
        assert!(doc_id_from_uri("telar-mod://localhost/").is_none());
        assert!(doc_id_from_uri("nonsense").is_none());
    }

    #[test]
    fn set_get_clear_roundtrip() {
        interactive_module_set("t1".into(), "<p>hola</p>".into()).unwrap();
        assert_eq!(
            DOCS.lock().unwrap().get("t1").map(String::as_str),
            Some("<p>hola</p>")
        );
        interactive_module_clear("t1".into()).unwrap();
        assert!(DOCS.lock().unwrap().get("t1").is_none());
    }

    #[test]
    fn rejects_oversized_documents() {
        let big = "x".repeat(MAX_DOC_BYTES + 1);
        assert!(interactive_module_set("big".into(), big).is_err());
    }
}
