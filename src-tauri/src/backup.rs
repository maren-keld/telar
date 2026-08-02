//! Respaldo cifrado en carpeta del usuario (Google Drive, Dropbox, etc.).
//! El archivo `.age` usa una clave de recuperación independiente del PIN de 6 dígitos.

use std::fs;
use std::io::{Read, Write};
use std::iter;
use std::path::{Path, PathBuf};

use age::x25519::{Identity, Recipient};
use age::{Decryptor, Encryptor, Identity as AgeIdentityTrait};
use base64::Engine;
use chrono::Utc;
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use rand::rngs::OsRng;
use rand::RngCore;
use secrecy::ExposeSecret;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tar::{Archive, Builder as TarBuilder};
use tauri::AppHandle;
use zeroize::{Zeroize, Zeroizing};

use crate::secure_db::{
    app_cache_dir, app_config_dir, backup_encrypted_db, count_patients_in_conn, db_lock,
    derive_key_from_pin_for_backup, install_encrypted_db_file, open_encrypted_at, reopen_encrypted_db,
    schema_version, with_open_conn,
};

const BACKUP_RETENTION: usize = 7;
const DB_ARCHIVE_NAME: &str = "db.sqlcipher";
const MANIFEST_NAME: &str = "manifest.json";
const BACKUP_PREFIX: &str = "telar-respaldo-";
const BACKUP_SUFFIX: &str = ".age";
/// Identidad age en AppConfig (0600). No usamos Keychain: los builds ad-hoc
/// cambian de firma y macOS pide la contraseña del llavero al abrir Ajustes.
const IDENTITY_FILE: &str = "cloud_backup_identity.dat";

#[cfg(target_os = "macos")]
const KEYCHAIN_SERVICE: &str = "cl.telar.app";
#[cfg(target_os = "macos")]
const KEYCHAIN_ACCOUNT: &str = "cloud-backup-recovery";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct BackupManifest {
    pub schema_version: u32,
    pub app_version: String,
    pub created_at: String,
    pub db_key_b64: String,
    pub sha256_db: String,
    pub bytes: u64,
}

#[derive(Debug, Serialize)]
pub struct BackupCreateResult {
    pub path: String,
    pub skipped_duplicate: bool,
    pub created_at: String,
    pub bytes: u64,
}

#[derive(Debug, Serialize)]
pub struct BackupRestorePreview {
    pub created_at: String,
    pub app_version: String,
    pub schema_version: u32,
    pub patient_count: u64,
    pub bytes: u64,
}

#[derive(Debug, Serialize)]
pub struct CloudBackupFolderStatus {
    pub accessible: bool,
    pub backup_count: usize,
    pub last_backup_at: Option<String>,
    pub last_backup_bytes: Option<u64>,
    pub last_backup_name: Option<String>,
}

fn random_db_key() -> Zeroizing<String> {
    let mut raw = [0u8; 32];
    OsRng.fill_bytes(&mut raw);
    let encoded = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(raw);
    raw.zeroize();
    Zeroizing::new(encoded)
}

fn sha256_hex(data: &[u8]) -> String {
    let digest = Sha256::digest(data);
    format!("{:x}", digest)
}

fn escape_sql_str(value: &str) -> String {
    value.replace('\'', "''")
}

fn load_identity_from_str(secret: &str) -> Result<Identity, String> {
    secret
        .trim()
        .parse()
        .map_err(|_| "Clave de recuperación incorrecta.".to_string())
}

pub fn generate_age_identity() -> Result<(Identity, String), String> {
    let identity = Identity::generate();
    let recovery_key = identity.to_string().expose_secret().to_string();
    Ok((identity, recovery_key))
}

pub fn identity_from_recovery_key(recovery_key: &str) -> Result<Identity, String> {
    load_identity_from_str(recovery_key)
}

fn identity_storage_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_config_dir(app)?.join(IDENTITY_FILE))
}

/// Borra la entrada heredada del Keychain sin leerla (nunca muestra UI).
pub fn purge_legacy_keychain_identity() {
    #[cfg(target_os = "macos")]
    {
        use security_framework::passwords::delete_generic_password;
        let _ = delete_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    }
    #[cfg(target_os = "windows")]
    {
        if let Ok(entry) = keyring::Entry::new("Telar", "cloud-backup-recovery") {
            let _ = entry.delete_credential();
        }
    }
}

fn write_identity_file(path: &Path, secret: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("No se pudo crear carpeta de configuración: {e}"))?;
    }
    fs::write(path, secret.as_bytes()).map_err(|e| format!("No se pudo guardar la clave de recuperación: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
    }
    purge_legacy_keychain_identity();
    Ok(())
}

fn store_identity_secret(app: &AppHandle, secret: &str) -> Result<(), String> {
    let path = identity_storage_path(app)?;
    write_identity_file(&path, secret)
}

fn load_identity_secret(app: &AppHandle) -> Result<Zeroizing<String>, String> {
    let path = identity_storage_path(app)?;
    if !path.is_file() {
        return Err("No hay clave de recuperación configurada.".to_string());
    }
    let bytes = fs::read(&path).map_err(|e| format!("No se pudo leer la clave de recuperación: {e}"))?;
    Ok(Zeroizing::new(
        String::from_utf8(bytes).map_err(|_| "Clave de recuperación corrupta.".to_string())?,
    ))
}

pub fn has_backup_identity(app: &AppHandle) -> bool {
    identity_storage_path(app)
        .map(|p| p.is_file() && fs::metadata(&p).map(|m| m.len() > 0).unwrap_or(false))
        .unwrap_or(false)
}

/// Genera identidad age, la guarda en AppConfig y devuelve la clave de recuperación (mostrar una sola vez).
pub fn setup_backup_identity(app: &AppHandle) -> Result<String, String> {
    let (identity, recovery_key) = generate_age_identity()?;
    store_identity_secret(app, identity.to_string().expose_secret())?;
    Ok(recovery_key)
}

/// Guarda una clave de recuperación ya conocida (p. ej. tras actualizar desde Keychain).
pub fn import_backup_identity(app: &AppHandle, recovery_key: &str) -> Result<(), String> {
    let identity = load_identity_from_str(recovery_key)?;
    store_identity_secret(app, identity.to_string().expose_secret())
}

fn resolve_identity(app: &AppHandle, recovery_key: Option<&str>) -> Result<Identity, String> {
    if let Some(key) = recovery_key {
        return load_identity_from_str(key);
    }
    let stored = load_identity_secret(app)?;
    load_identity_from_str(&stored)
}

pub fn age_encrypt(recipient: &Recipient, plaintext: &[u8]) -> Result<Vec<u8>, String> {
    let encryptor = Encryptor::with_recipients(iter::once(recipient as &dyn age::Recipient))
        .map_err(|e| format!("No se pudo cifrar el respaldo: {e}"))?;
    let mut encrypted = Vec::new();
    {
        let mut writer = encryptor
            .wrap_output(&mut encrypted)
            .map_err(|e| format!("No se pudo cifrar el respaldo: {e}"))?;
        writer
            .write_all(plaintext)
            .map_err(|e| format!("No se pudo cifrar el respaldo: {e}"))?;
        writer
            .finish()
            .map_err(|e| format!("No se pudo cifrar el respaldo: {e}"))?;
    }
    Ok(encrypted)
}

pub fn age_decrypt(identity: &Identity, ciphertext: &[u8]) -> Result<Vec<u8>, String> {
    let decryptor =
        Decryptor::new(ciphertext).map_err(|_| "Archivo de respaldo inválido o corrupto.".to_string())?;
    let mut reader = decryptor
        .decrypt(iter::once(identity as &dyn AgeIdentityTrait))
        .map_err(|_| "Clave de recuperación incorrecta o archivo dañado.".to_string())?;
    let mut plaintext = Vec::new();
    reader
        .read_to_end(&mut plaintext)
        .map_err(|_| "Archivo de respaldo corrupto o truncado.".to_string())?;
    Ok(plaintext)
}

fn build_tar_gz(db_bytes: &[u8], manifest: &BackupManifest) -> Result<Vec<u8>, String> {
    let manifest_json =
        serde_json::to_vec_pretty(manifest).map_err(|e| format!("Manifiesto inválido: {e}"))?;
    let gz = GzEncoder::new(Vec::new(), Compression::default());
    let mut tar = TarBuilder::new(gz);
    let mut db_header = tar::Header::new_gnu();
    db_header.set_size(db_bytes.len() as u64);
    db_header.set_mode(0o600);
    db_header.set_cksum();
    tar.append_data(&mut db_header, DB_ARCHIVE_NAME, &mut &db_bytes[..])
        .map_err(|e| format!("No se pudo empaquetar respaldo: {e}"))?;
    let mut man_header = tar::Header::new_gnu();
    man_header.set_size(manifest_json.len() as u64);
    man_header.set_mode(0o600);
    man_header.set_cksum();
    tar.append_data(&mut man_header, MANIFEST_NAME, &mut &manifest_json[..])
        .map_err(|e| format!("No se pudo empaquetar respaldo: {e}"))?;
    tar.finish().map_err(|e| format!("No se pudo empaquetar respaldo: {e}"))?;
    let gz = tar.into_inner().map_err(|e| format!("No se pudo comprimir respaldo: {e}"))?;
    gz.finish().map_err(|e| format!("No se pudo comprimir respaldo: {e}"))
}

pub fn parse_tar_gz(payload: &[u8]) -> Result<(Vec<u8>, BackupManifest), String> {
    let gz = GzDecoder::new(payload);
    let mut archive = Archive::new(gz);
    let mut db_bytes: Option<Vec<u8>> = None;
    let mut manifest: Option<BackupManifest> = None;
    for entry in archive
        .entries()
        .map_err(|_| "Contenedor de respaldo corrupto.".to_string())?
    {
        let mut entry = entry.map_err(|_| "Contenedor de respaldo corrupto.".to_string())?;
        let path = entry
            .path()
            .map_err(|_| "Contenedor de respaldo corrupto.".to_string())?
            .to_string_lossy()
            .to_string();
        let mut buf = Vec::new();
        entry
            .read_to_end(&mut buf)
            .map_err(|_| "Contenedor de respaldo corrupto.".to_string())?;
        if path == DB_ARCHIVE_NAME {
            db_bytes = Some(buf);
        } else if path == MANIFEST_NAME {
            manifest = Some(
                serde_json::from_slice(&buf).map_err(|_| "Manifiesto de respaldo inválido.".to_string())?,
            );
        }
    }
    let db_bytes = db_bytes.ok_or_else(|| "Respaldo incompleto: falta la base de datos.".to_string())?;
    let manifest = manifest.ok_or_else(|| "Respaldo incompleto: falta el manifiesto.".to_string())?;
    Ok((db_bytes, manifest))
}

pub fn validate_manifest(manifest: &BackupManifest, db_bytes: &[u8]) -> Result<(), String> {
    if manifest.schema_version > schema_version() {
        return Err(format!(
            "Este respaldo requiere Telar más nuevo (esquema {}). Actualiza la app e inténtalo de nuevo.",
            manifest.schema_version
        ));
    }
    let hash = sha256_hex(db_bytes);
    if hash != manifest.sha256_db {
        return Err("Integridad del respaldo comprometida (checksum no coincide).".to_string());
    }
    if manifest.bytes != db_bytes.len() as u64 {
        return Err("Integridad del respaldo comprometida (tamaño no coincide).".to_string());
    }
    Ok(())
}

fn list_backup_files(dest_dir: &Path) -> Result<Vec<PathBuf>, String> {
    if !dest_dir.is_dir() {
        return Ok(Vec::new());
    }
    let mut files: Vec<PathBuf> = fs::read_dir(dest_dir)
        .map_err(|e| format!("No se pudo leer carpeta de respaldo: {e}"))?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with(BACKUP_PREFIX) && n.ends_with(BACKUP_SUFFIX))
                .unwrap_or(false)
        })
        .collect();
    files.sort();
    Ok(files)
}

fn last_backup_sha256(dest_dir: &Path, identity: &Identity) -> Result<Option<String>, String> {
    let files = list_backup_files(dest_dir)?;
    let Some(last) = files.last() else {
        return Ok(None);
    };
    let bytes = fs::read(last).map_err(|e| format!("No se pudo leer último respaldo: {e}"))?;
    let payload = age_decrypt(identity, &bytes)?;
    let (_, manifest) = parse_tar_gz(&payload)?;
    Ok(Some(manifest.sha256_db))
}

fn prune_old_backups(dest_dir: &Path) -> Result<(), String> {
    let mut files = list_backup_files(dest_dir)?;
    if files.len() <= BACKUP_RETENTION {
        return Ok(());
    }
    let remove_count = files.len() - BACKUP_RETENTION;
    for path in files.drain(0..remove_count) {
        let _ = fs::remove_file(path);
    }
    Ok(())
}

fn backup_filename(now: &chrono::DateTime<Utc>) -> String {
    format!("{BACKUP_PREFIX}{}.age", now.format("%Y-%m-%d_%H%M%S"))
}

fn export_rekeyed_copy(conn_work: &Path, backup_key: &str) -> Result<PathBuf, String> {
    let rekeyed_path = conn_work.join("rekeyed.db");
    if rekeyed_path.exists() {
        fs::remove_file(&rekeyed_path).map_err(|e| format!("No se pudo limpiar temporal: {e}"))?;
    }
    let dest_escaped = escape_sql_str(&rekeyed_path.to_string_lossy());
    let key_escaped = escape_sql_str(backup_key);
    with_open_conn(|conn| {
        conn.execute_batch(&format!(
            "ATTACH DATABASE '{dest_escaped}' AS rekeyed KEY '{key_escaped}';\
             PRAGMA rekeyed.cipher_compatibility = 4;\
             SELECT sqlcipher_export('rekeyed');\
             DETACH DATABASE rekeyed;"
        ))
        .map_err(|e| format!("No se pudo re-cifrar copia de respaldo: {e}"))
    })?;
    Ok(rekeyed_path)
}

fn decode_backup_db_key(manifest: &BackupManifest) -> Result<Zeroizing<String>, String> {
    let raw = base64::engine::general_purpose::STANDARD
        .decode(manifest.db_key_b64.as_bytes())
        .map_err(|_| "Manifiesto de respaldo inválido.".to_string())?;
    Ok(Zeroizing::new(
        String::from_utf8(raw).map_err(|_| "Manifiesto de respaldo inválido.".to_string())?,
    ))
}

fn open_payload_from_backup(
    app: Option<&AppHandle>,
    path: &Path,
    recovery_key: Option<&str>,
) -> Result<(Vec<u8>, BackupManifest), String> {
    let identity = match recovery_key {
        Some(key) => load_identity_from_str(key)?,
        None => {
            let app = app.ok_or_else(|| {
                "No hay clave de recuperación configurada.".to_string()
            })?;
            resolve_identity(app, None)?
        }
    };
    let ciphertext = fs::read(path).map_err(|e| format!("No se pudo leer respaldo: {e}"))?;
    if ciphertext.is_empty() {
        return Err("Archivo de respaldo vacío o truncado.".to_string());
    }
    let payload = age_decrypt(&identity, &ciphertext)?;
    let (db_bytes, manifest) = parse_tar_gz(&payload)?;
    validate_manifest(&manifest, &db_bytes)?;
    Ok((db_bytes, manifest))
}

/// Estado de la carpeta destino (accesibilidad y último respaldo `.age`).
pub fn cloud_backup_folder_status(dest_dir: &Path) -> CloudBackupFolderStatus {
    if !dest_dir.is_dir() {
        return CloudBackupFolderStatus {
            accessible: false,
            backup_count: 0,
            last_backup_at: None,
            last_backup_bytes: None,
            last_backup_name: None,
        };
    }

    let files = list_backup_files(dest_dir).unwrap_or_default();
    let last = files.last().and_then(|p| {
        let meta = fs::metadata(p).ok()?;
        let modified = meta.modified().ok()?;
        let datetime: chrono::DateTime<Utc> = modified.into();
        Some((
            p.file_name()?.to_string_lossy().to_string(),
            datetime.to_rfc3339(),
            meta.len(),
        ))
    });

    CloudBackupFolderStatus {
        accessible: true,
        backup_count: files.len(),
        last_backup_at: last.as_ref().map(|t| t.1.clone()),
        last_backup_bytes: last.as_ref().map(|t| t.2),
        last_backup_name: last.as_ref().map(|t| t.0.clone()),
    }
}

/// Crea un respaldo `.age` en `dest_dir`. Requiere DB desbloqueada e identidad configurada.
pub fn create_cloud_backup(app: &AppHandle, dest_dir: &Path) -> Result<BackupCreateResult, String> {
    if !dest_dir.is_dir() {
        return Err("La carpeta de respaldo no existe o no es accesible.".to_string());
    }

    let identity = resolve_identity(app, None)?;
    let recipient = identity.to_public();

    let work_dir = app_cache_dir(app)?.join(format!(
        "backup-work-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    fs::create_dir_all(&work_dir).map_err(|e| format!("No se pudo crear carpeta temporal: {e}"))?;

    let result = (|| {
        let backup_key = random_db_key();
        let rekeyed_path = export_rekeyed_copy(&work_dir, &backup_key)?;
        let db_bytes = fs::read(&rekeyed_path).map_err(|e| format!("No se pudo leer copia de respaldo: {e}"))?;
        let hash = sha256_hex(&db_bytes);

        if let Ok(Some(prev_hash)) = last_backup_sha256(dest_dir, &identity) {
            if prev_hash == hash {
                return Ok(BackupCreateResult {
                    path: String::new(),
                    skipped_duplicate: true,
                    created_at: Utc::now().to_rfc3339(),
                    bytes: db_bytes.len() as u64,
                });
            }
        }

        let now = Utc::now();
        let manifest = BackupManifest {
            schema_version: schema_version(),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            created_at: now.to_rfc3339(),
            db_key_b64: base64::engine::general_purpose::STANDARD.encode(backup_key.as_bytes()),
            sha256_db: hash,
            bytes: db_bytes.len() as u64,
        };

        let tar_gz = build_tar_gz(&db_bytes, &manifest)?;
        let encrypted = age_encrypt(&recipient, &tar_gz)?;

        let filename = backup_filename(&now);
        let dest_path = dest_dir.join(&filename);
        if dest_path.exists() {
            return Err("Ya existe un respaldo con ese nombre. Inténtalo de nuevo.".to_string());
        }

        fs::write(&dest_path, &encrypted).map_err(|e| {
            if e.kind() == std::io::ErrorKind::StorageFull {
                "Disco lleno: no se pudo guardar el respaldo.".to_string()
            } else {
                format!("No se pudo escribir respaldo: {e}")
            }
        })?;

        prune_old_backups(dest_dir)?;

        Ok(BackupCreateResult {
            path: dest_path.to_string_lossy().to_string(),
            skipped_duplicate: false,
            created_at: manifest.created_at,
            bytes: manifest.bytes,
        })
    })();

    let _ = fs::remove_dir_all(&work_dir);
    result
}

pub fn preview_cloud_restore(
    app: Option<&AppHandle>,
    backup_path: &Path,
    recovery_key: Option<&str>,
) -> Result<BackupRestorePreview, String> {
    let (db_bytes, manifest) = open_payload_from_backup(app, backup_path, recovery_key)?;
    let backup_key = decode_backup_db_key(&manifest)?;

    let work_dir = tempfile::tempdir().map_err(|e| format!("No se pudo crear temporal: {e}"))?;
    let db_path = work_dir.path().join("inspect.db");
    fs::write(&db_path, &db_bytes).map_err(|e| format!("No se pudo preparar vista previa: {e}"))?;

    let conn = open_encrypted_at(&db_path, &backup_key)?;
    let patient_count = count_patients_in_conn(&conn)?;

    Ok(BackupRestorePreview {
        created_at: manifest.created_at,
        app_version: manifest.app_version,
        schema_version: manifest.schema_version,
        patient_count,
        bytes: manifest.bytes,
    })
}

/// Restaura un respaldo sobre la instalación local. Crea respaldo local previo automáticamente.
pub fn restore_cloud_backup(
    app: &AppHandle,
    backup_path: &Path,
    recovery_key: Option<&str>,
    pin: &str,
) -> Result<(), String> {
    let (db_bytes, manifest) = open_payload_from_backup(Some(app), backup_path, recovery_key)?;
    let backup_key = decode_backup_db_key(&manifest)?;

    let _local_backup = backup_encrypted_db(app);

    db_lock()?;

    let work_dir = app_cache_dir(app)?.join(format!(
        "restore-work-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    fs::create_dir_all(&work_dir).map_err(|e| format!("No se pudo crear carpeta temporal: {e}"))?;

    let result = (|| {
        let staged = work_dir.join("restored.db");
        fs::write(&staged, &db_bytes).map_err(|e| format!("No se pudo preparar restauración: {e}"))?;

        let pin_key = derive_key_from_pin_for_backup(app, pin)?;
        crate::secure_db::rekey_encrypted_file(&staged, &backup_key, &pin_key)?;

        install_encrypted_db_file(app, &staged)?;
        reopen_encrypted_db(app, pin)
    })();

    let _ = fs::remove_dir_all(&work_dir);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::secure_db::{open_encrypted_at, rekey_encrypted_file, vacuum_db_into};
    use rusqlite::Connection;
    use tempfile::TempDir;

    fn test_identity() -> Identity {
        Identity::generate()
    }

    #[test]
    fn age_roundtrip() {
        let id = test_identity();
        let recipient = id.to_public();
        let plain = b"telar-backup-payload-test";
        let enc = age_encrypt(&recipient, plain).unwrap();
        let dec = age_decrypt(&id, &enc).unwrap();
        assert_eq!(dec, plain);
    }

    #[test]
    fn age_tampered_byte_fails() {
        let id = test_identity();
        let recipient = id.to_public();
        let mut enc = age_encrypt(&recipient, b"secret").unwrap();
        if !enc.is_empty() {
            let idx = enc.len() / 2;
            enc[idx] ^= 0xff;
        }
        assert!(age_decrypt(&id, &enc).is_err());
    }

    #[test]
    fn rekey_roundtrip() {
        let dir = TempDir::new().unwrap();
        let db_path = dir.path().join("test.db");
        let old_key = random_db_key();
        let new_key = random_db_key();

        {
            let conn = Connection::open(&db_path).unwrap();
            let old_escaped = escape_sql_str(&old_key);
            conn.execute_batch(&format!(
                "PRAGMA key = '{old_escaped}';\
                 PRAGMA cipher_compatibility = 4;\
                 CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT);\
                 INSERT INTO t (v) VALUES ('ok');"
            ))
            .unwrap();
        }

        rekey_encrypted_file(&db_path, &old_key, &new_key).unwrap();
        assert!(open_encrypted_at(&db_path, &old_key).is_err());
        let conn = open_encrypted_at(&db_path, &new_key).unwrap();
        let v: String = conn
            .query_row("SELECT v FROM t", [], |r| r.get(0))
            .unwrap();
        assert_eq!(v, "ok");
    }

    #[test]
    fn future_schema_version_rejected() {
        let manifest = BackupManifest {
            schema_version: schema_version() + 100,
            app_version: "9.9.9".into(),
            created_at: Utc::now().to_rfc3339(),
            db_key_b64: "dGVzdA==".into(),
            sha256_db: "00".repeat(32),
            bytes: 1,
        };
        let err = validate_manifest(&manifest, &[0u8]).unwrap_err();
        assert!(err.contains("Telar más nuevo"));
    }

    #[test]
    fn vacuum_into_with_wal() {
        let dir = TempDir::new().unwrap();
        let db_path = dir.path().join("wal.db");
        let copy_path = dir.path().join("copy.db");
        let key = random_db_key();

        {
            let conn = Connection::open(&db_path).unwrap();
            let key_escaped = escape_sql_str(&key);
            conn.execute_batch(&format!(
                "PRAGMA key = '{key_escaped}';\
                 PRAGMA cipher_compatibility = 4;\
                 PRAGMA journal_mode = WAL;\
                 CREATE TABLE items (id INTEGER PRIMARY KEY, n INTEGER);\
                 INSERT INTO items (n) VALUES (1);"
            ))
            .unwrap();
            conn.execute("INSERT INTO items (n) VALUES (2)", []).unwrap();
            vacuum_db_into(&conn, &copy_path).unwrap();
        }

        let conn = open_encrypted_at(&copy_path, &key).unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM items", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 2);
    }

    #[test]
    fn tar_manifest_roundtrip() {
        let db = b"fake-db-bytes";
        let manifest = BackupManifest {
            schema_version: 1,
            app_version: "0.1.0".into(),
            created_at: Utc::now().to_rfc3339(),
            db_key_b64: base64::engine::general_purpose::STANDARD.encode(b"key"),
            sha256_db: sha256_hex(db),
            bytes: db.len() as u64,
        };
        let tar = build_tar_gz(db, &manifest).unwrap();
        let (db2, man2) = parse_tar_gz(&tar).unwrap();
        assert_eq!(db2, db);
        assert_eq!(man2, manifest);
    }

    #[test]
    fn backup_restore_end_to_end() {
        let dir = TempDir::new().unwrap();
        let dest = dir.path().join("backups");
        fs::create_dir_all(&dest).unwrap();

        let id = test_identity();
        let recovery = id.to_string().expose_secret().to_string();
        let _ = &recovery;

        let src_db = dir.path().join("source.db");
        let key = random_db_key();
        {
            let conn = Connection::open(&src_db).unwrap();
            let key_escaped = escape_sql_str(&key);
            conn.execute_batch(&format!(
                "PRAGMA key = '{key_escaped}';\
                 PRAGMA cipher_compatibility = 4;\
                 CREATE TABLE patients (id INTEGER PRIMARY KEY, name TEXT);\
                 INSERT INTO patients (name) VALUES ('Ana'), ('Luis');"
            ))
            .unwrap();
        }

        // Simular export rekeyed (como create_cloud_backup)
        let backup_key = random_db_key();
        let rekeyed = dir.path().join("rekeyed.db");
        {
            let conn = open_encrypted_at(&src_db, &key).unwrap();
            let dest_escaped = escape_sql_str(&rekeyed.to_string_lossy());
            let bk_escaped = escape_sql_str(&backup_key);
            conn.execute_batch(&format!(
                "ATTACH DATABASE '{dest_escaped}' AS rekeyed KEY '{bk_escaped}';\
                 PRAGMA rekeyed.cipher_compatibility = 4;\
                 SELECT sqlcipher_export('rekeyed');\
                 DETACH DATABASE rekeyed;"
            ))
            .unwrap();
        }

        let db_bytes = fs::read(&rekeyed).unwrap();
        let manifest = BackupManifest {
            schema_version: schema_version(),
            app_version: env!("CARGO_PKG_VERSION").into(),
            created_at: Utc::now().to_rfc3339(),
            db_key_b64: base64::engine::general_purpose::STANDARD.encode(backup_key.as_bytes()),
            sha256_db: sha256_hex(&db_bytes),
            bytes: db_bytes.len() as u64,
        };
        let tar_gz = build_tar_gz(&db_bytes, &manifest).unwrap();
        let encrypted = age_encrypt(&id.to_public(), &tar_gz).unwrap();
        let backup_file = dest.join("telar-respaldo-test.age");
        fs::write(&backup_file, &encrypted).unwrap();

        let preview = preview_cloud_restore(None, &backup_file, Some(&recovery)).unwrap();
        assert_eq!(preview.patient_count, 2);

        // Restaurar a nueva DB con PIN simulado (rekey manual)
        let restored = dir.path().join("restored.db");
        fs::write(&restored, &db_bytes).unwrap();
        let pin_key = random_db_key();
        rekey_encrypted_file(&restored, &backup_key, &pin_key).unwrap();

        let conn = open_encrypted_at(&restored, &pin_key).unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM patients", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 2);
    }
}
