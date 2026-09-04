//! Lectura y escritura de `.telarpack`: un tar.gz con `pack.json` y los archivos
//! de los módulos (definiciones de cuestionario en JSON, HTML de experiencias
//! interactivas). Se usa para instalar packs privados que no pueden viajar
//! dentro de la app por licencia del material clínico.

use std::collections::BTreeMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use serde::{Deserialize, Serialize};

/// Un pack completo cabe de sobra en memoria; el tope evita que un archivo
/// manipulado infle la RAM al descomprimir.
const MAX_TOTAL_BYTES: u64 = 24 * 1024 * 1024;
const MAX_ENTRIES: usize = 500;

#[derive(Debug, Serialize)]
pub struct PackContents {
    /// Ruta relativa dentro del pack → contenido de texto (UTF-8).
    pub files: BTreeMap<String, String>,
}

#[derive(Debug, Deserialize)]
pub struct PackFileInput {
    pub name: String,
    pub content: String,
}

fn normalize_pack_path(raw: &str) -> PathBuf {
    let trimmed = raw.trim();
    let without_scheme = trimmed.strip_prefix("file://").unwrap_or(trimmed);
    let decoded = percent_decode_path(without_scheme);
    PathBuf::from(decoded)
}

fn percent_decode_path(raw: &str) -> String {
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

fn skip_pack_entry(name: &str) -> bool {
    let base = name.rsplit('/').next().unwrap_or(name);
    name.ends_with('/')
        || name.contains("PaxHeader")
        || name.contains("__MACOSX")
        || base == ".DS_Store"
        || base.starts_with("._")
}

/// Ruta relativa segura dentro del pack: sin `..`, sin absolutas, máximo 3 niveles.
fn safe_entry_path(raw: &str) -> Option<String> {
    let cleaned = raw.trim_start_matches("./").trim();
    if cleaned.is_empty() || cleaned.contains('\0') || skip_pack_entry(cleaned) {
        return None;
    }
    let path = Path::new(cleaned);
    if path.is_absolute() {
        return None;
    }
    let mut parts = Vec::new();
    for comp in path.components() {
        match comp {
            std::path::Component::Normal(s) => parts.push(s.to_string_lossy().to_string()),
            _ => return None,
        }
    }
    if parts.is_empty() || parts.len() > 3 {
        return None;
    }
    Some(parts.join("/"))
}

#[tauri::command]
pub fn pack_read(path: String) -> Result<PackContents, String> {
    let path = normalize_pack_path(&path);
    let file = std::fs::File::open(&path)
        .map_err(|e| format!("No se pudo abrir el pack: {e}"))?;
    let mut archive = tar::Archive::new(GzDecoder::new(file));

    let mut files = BTreeMap::new();
    let mut total: u64 = 0;

    let entries = archive
        .entries()
        .map_err(|_| "El archivo no parece un pack de Telar (.telarpack).".to_string())?;

    for entry in entries {
        let mut entry = entry.map_err(|e| format!("Pack dañado: {e}"))?;
        let raw = entry
            .path()
            .map_err(|e| format!("Pack dañado: {e}"))?
            .to_string_lossy()
            .to_string();
        // El tar de macOS mete carpetas (`questionnaires/`) y a veces `._` de
        // resource fork. No son módulos: se saltan, no se aborta el pack.
        if !entry.header().entry_type().is_file() || skip_pack_entry(&raw) {
            continue;
        }
        let Some(name) = safe_entry_path(&raw) else {
            continue;
        };
        total = total.saturating_add(entry.header().size().unwrap_or(0));
        if total > MAX_TOTAL_BYTES || files.len() >= MAX_ENTRIES {
            return Err("El pack es demasiado grande.".into());
        }
        let mut buf = Vec::new();
        entry
            .read_to_end(&mut buf)
            .map_err(|e| format!("No se pudo leer {name}: {e}"))?;
        match String::from_utf8(buf) {
            Ok(text) => {
                files.insert(name, text);
            }
            Err(_) => continue,
        }
    }

    if !files.contains_key("pack.json") {
        return Err("El pack no tiene pack.json. ¿Elegiste un archivo .telarpack?".into());
    }
    Ok(PackContents { files })
}

#[tauri::command]
pub fn pack_write(path: String, files: Vec<PackFileInput>) -> Result<String, String> {
    let path = PathBuf::from(path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("No se pudo crear la carpeta destino: {e}"))?;
    }
    let out = std::fs::File::create(&path)
        .map_err(|e| format!("No se pudo crear el pack: {e}"))?;
    let mut builder = tar::Builder::new(GzEncoder::new(out, Compression::default()));

    for file in &files {
        let name = safe_entry_path(&file.name)
            .ok_or_else(|| format!("Nombre de archivo no permitido: {}", file.name))?;
        let bytes = file.content.as_bytes();
        let mut header = tar::Header::new_gnu();
        header.set_size(bytes.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        builder
            .append_data(&mut header, &name, bytes)
            .map_err(|e| format!("No se pudo escribir {name}: {e}"))?;
    }

    let encoder = builder
        .into_inner()
        .map_err(|e| format!("No se pudo cerrar el pack: {e}"))?;
    let mut out = encoder
        .finish()
        .map_err(|e| format!("No se pudo comprimir el pack: {e}"))?;
    out.flush().map_err(|e| format!("No se pudo guardar el pack: {e}"))?;

    Ok(path.to_string_lossy().to_string())
}

/// Lee el `.zip` que CodePen entrega con «Export → Export .zip». Devuelve solo
/// los archivos de texto (`index.html`, `style.css`, `script.js`, …); los assets
/// binarios se ignoran y el front avisa si faltan.
#[tauri::command]
pub fn codepen_zip_read(path: String) -> Result<PackContents, String> {
    let file = std::fs::File::open(PathBuf::from(path))
        .map_err(|e| format!("No se pudo abrir el archivo: {e}"))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|_| "El archivo no es un .zip válido.".to_string())?;

    let mut files = BTreeMap::new();
    let mut total: u64 = 0;

    for i in 0..archive.len().min(MAX_ENTRIES) {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Zip dañado: {e}"))?;
        if !entry.is_file() {
            continue;
        }
        let raw = entry.name().to_string();
        // El zip de CodePen mete todo en una carpeta con el nombre del pen.
        let name = raw.rsplit('/').next().unwrap_or(&raw).to_string();
        if !name.ends_with(".html") && !name.ends_with(".css") && !name.ends_with(".js") {
            continue;
        }
        total = total.saturating_add(entry.size());
        if total > MAX_TOTAL_BYTES {
            return Err("El zip es demasiado grande.".into());
        }
        let mut buf = String::new();
        if entry.read_to_string(&mut buf).is_ok() {
            files.insert(name, buf);
        }
    }

    if files.is_empty() {
        return Err("El zip no trae HTML, CSS ni JS.".into());
    }
    Ok(PackContents { files })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn entry_paths_reject_traversal_and_absolutes() {
        assert_eq!(safe_entry_path("pack.json").as_deref(), Some("pack.json"));
        assert_eq!(
            safe_entry_path("./questionnaires/aq10.json").as_deref(),
            Some("questionnaires/aq10.json")
        );
        assert!(safe_entry_path("../etc/passwd").is_none());
        assert!(safe_entry_path("/etc/passwd").is_none());
        assert!(safe_entry_path("a/../b").is_none());
        assert!(safe_entry_path("a/b/c/d.json").is_none());
        assert!(safe_entry_path("").is_none());
        assert!(safe_entry_path("questionnaires/").is_none());
        assert!(safe_entry_path("questionnaires/._aq10.json").is_none());
        assert!(safe_entry_path(".DS_Store").is_none());
    }

    #[test]
    fn macos_tar_directory_entries_are_skipped() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("macos.telarpack");
        {
            let out = std::fs::File::create(&path).unwrap();
            let mut builder = tar::Builder::new(GzEncoder::new(out, Compression::default()));
            let mut dir_header = tar::Header::new_gnu();
            dir_header.set_entry_type(tar::EntryType::Directory);
            dir_header.set_size(0);
            dir_header.set_mode(0o755);
            dir_header.set_cksum();
            builder
                .append_data(&mut dir_header, "questionnaires", &[] as &[u8])
                .unwrap();
            let payload = b"{\"id\":\"demo\"}";
            let mut file_header = tar::Header::new_gnu();
            file_header.set_size(payload.len() as u64);
            file_header.set_mode(0o644);
            file_header.set_cksum();
            builder
                .append_data(&mut file_header, "pack.json", &payload[..])
                .unwrap();
            builder.into_inner().unwrap().finish().unwrap();
        }
        let read = pack_read(path.to_string_lossy().to_string()).unwrap();
        assert_eq!(read.files.len(), 1);
        assert_eq!(read.files["pack.json"], "{\"id\":\"demo\"}");
    }

    #[test]
    fn write_then_read_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("demo.telarpack");
        let written = pack_write(
            path.to_string_lossy().to_string(),
            vec![
                PackFileInput {
                    name: "pack.json".into(),
                    content: "{\"id\":\"demo\"}".into(),
                },
                PackFileInput {
                    name: "questionnaires/a.json".into(),
                    content: "{\"schema\":1}".into(),
                },
            ],
        )
        .unwrap();
        assert!(std::path::Path::new(&written).exists());

        let read = pack_read(written).unwrap();
        assert_eq!(read.files.len(), 2);
        assert_eq!(read.files["pack.json"], "{\"id\":\"demo\"}");
        assert_eq!(read.files["questionnaires/a.json"], "{\"schema\":1}");
    }

    #[test]
    fn read_requires_pack_json() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("bad.telarpack");
        let written = pack_write(
            path.to_string_lossy().to_string(),
            vec![PackFileInput {
                name: "questionnaires/a.json".into(),
                content: "{}".into(),
            }],
        )
        .unwrap();
        assert!(pack_read(written).is_err());
    }
}
