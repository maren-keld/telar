use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use argon2::password_hash::SaltString;
use argon2::{Algorithm, Argon2, Params, Version};
use base64::Engine;
use once_cell::sync::Lazy;
use rand::rngs::OsRng;
use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{params_from_iter, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value as JsonValue};
use tauri::Manager;
use tauri::path::BaseDirectory;

use crate::touch_id;

static DB_CONN: Lazy<Mutex<Option<Connection>>> = Lazy::new(|| Mutex::new(None));

// --- PIN lockout ---
struct PinLockout {
    failed_attempts: u32,
    locked_until: Option<std::time::Instant>,
}

static PIN_LOCKOUT: Lazy<Mutex<PinLockout>> = Lazy::new(|| {
    Mutex::new(PinLockout { failed_attempts: 0, locked_until: None })
});

fn lockout_delay_secs(attempts: u32) -> Option<u64> {
    match attempts {
        0..=4 => None,
        5 => Some(30),
        6 => Some(60),
        7 => Some(120),
        _ => Some(300),
    }
}

fn check_pin_lockout() -> Result<(), String> {
    let guard = PIN_LOCKOUT.lock().map_err(|_| "Error interno de bloqueo".to_string())?;
    if let Some(until) = guard.locked_until {
        if std::time::Instant::now() < until {
            let remaining = (until - std::time::Instant::now()).as_secs() + 1;
            return Err(format!(
                "Demasiados intentos fallidos. Espera {remaining}s antes de intentar de nuevo."
            ));
        }
    }
    Ok(())
}

fn record_pin_failure() {
    if let Ok(mut guard) = PIN_LOCKOUT.lock() {
        guard.failed_attempts += 1;
        if let Some(delay) = lockout_delay_secs(guard.failed_attempts) {
            guard.locked_until =
                Some(std::time::Instant::now() + std::time::Duration::from_secs(delay));
        }
    }
}

fn reset_pin_lockout() {
    if let Ok(mut guard) = PIN_LOCKOUT.lock() {
        guard.failed_attempts = 0;
        guard.locked_until = None;
    }
}

// --- SQL allowlist ---
fn validate_select_sql(sql: &str) -> Result<(), String> {
    let first = sql.trim().split_whitespace().next().unwrap_or("").to_uppercase();
    match first.as_str() {
        "SELECT" | "WITH" => Ok(()),
        kw => Err(format!("Tipo de consulta no permitido: {kw}. Solo SELECT/WITH.")),
    }
}

fn validate_execute_sql(sql: &str) -> Result<(), String> {
    let first = sql.trim().split_whitespace().next().unwrap_or("").to_uppercase();
    match first.as_str() {
        "INSERT" | "UPDATE" | "DELETE" => Ok(()),
        kw => Err(format!("Operación no permitida: {kw}. Solo INSERT/UPDATE/DELETE.")),
    }
}

const PLAINTEXT_DB_NAME: &str = "telar.db";
const ENCRYPTED_DB_NAME: &str = "telar.enc.db";
const KEYINFO_NAME: &str = "secure.keyinfo.json";
const LEGACY_APP_ID: &str = "cl.psicoterapialab.desktop";
const LEGACY_ENCRYPTED_DB: &str = "psicoterapia.enc.db";
const LEGACY_PLAINTEXT_DB: &str = "psicoterapia.db";

#[derive(Debug, Serialize)]
pub struct DbStatus {
    pub unlocked: bool,
    pub needs_setup: bool,
    pub encrypted_db_exists: bool,
    pub plaintext_db_exists: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct KeyInfo {
    // base64 salt (16 bytes)
    salt_b64: String,
}

fn app_config_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .resolve("", BaseDirectory::AppConfig)
        .map_err(|e| format!("No se pudo resolver AppConfig dir: {e}"))
}

/// Tras renombrar la app (Psicoterapia Lab → Telar), copia datos desde el bundle id anterior.
fn migrate_legacy_app_data(app: &tauri::AppHandle) -> Result<(), String> {
    let new_dir = app_config_dir(app)?;
    let has_new = new_dir.exists()
        && fs::read_dir(&new_dir)
            .map(|d| d.filter_map(Result::ok).any(|e| !e.file_name().to_string_lossy().starts_with('.')))
            .unwrap_or(false);
    if has_new {
        return Ok(());
    }

    let Some(parent) = new_dir.parent() else {
        return Ok(());
    };
    let legacy_dir = parent.join(LEGACY_APP_ID);
    if !legacy_dir.is_dir() {
        return Ok(());
    }

    fs::create_dir_all(&new_dir).map_err(|e| format!("No se pudo crear AppConfig dir: {e}"))?;

    let pairs = [
        (LEGACY_ENCRYPTED_DB, ENCRYPTED_DB_NAME),
        (LEGACY_PLAINTEXT_DB, PLAINTEXT_DB_NAME),
        (KEYINFO_NAME, KEYINFO_NAME),
    ];
    for (from, to) in pairs {
        let src = legacy_dir.join(from);
        let dst = new_dir.join(to);
        if src.exists() && !dst.exists() {
            fs::copy(&src, &dst).map_err(|e| format!("Migración legacy ({from}): {e}"))?;
        }
    }
    Ok(())
}

fn keyinfo_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_config_dir(app)?.join(KEYINFO_NAME))
}

fn plaintext_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_config_dir(app)?.join(PLAINTEXT_DB_NAME))
}

fn encrypted_db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_config_dir(app)?.join(ENCRYPTED_DB_NAME))
}

fn touch_id_storage_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app_config_dir(app)?.join("touch_id_key.dat"))
}

fn read_keyinfo(app: &tauri::AppHandle) -> Result<Option<KeyInfo>, String> {
    let p = keyinfo_path(app)?;
    if !p.exists() {
        return Ok(None);
    }
    let txt = fs::read_to_string(&p).map_err(|e| format!("No se pudo leer keyinfo: {e}"))?;
    let info: KeyInfo =
        serde_json::from_str(&txt).map_err(|e| format!("Keyinfo inválido: {e}"))?;
    Ok(Some(info))
}

fn write_keyinfo(app: &tauri::AppHandle, info: &KeyInfo) -> Result<(), String> {
    let p = keyinfo_path(app)?;
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("No se pudo crear AppConfig dir: {e}"))?;
    }
    let txt = serde_json::to_string_pretty(info).map_err(|e| format!("Keyinfo: {e}"))?;
    fs::write(&p, txt).map_err(|e| format!("No se pudo escribir keyinfo: {e}"))?;
    Ok(())
}

fn derive_db_key(pin: &str, salt_raw: &[u8]) -> Result<String, String> {
    if pin.len() != 6 || !pin.chars().all(|c| c.is_ascii_digit()) {
        return Err("El PIN debe tener 6 dígitos".to_string());
    }

    // Strong-ish defaults: interactive unlock, still expensive enough.
    // m_cost: 64 MiB, t_cost: 3, p_cost: 1
    let params = Params::new(64 * 1024, 3, 1, Some(32))
        .map_err(|e| format!("Argon2 params inválidos: {e}"))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let mut out = [0u8; 32];
    argon2
        .hash_password_into(pin.as_bytes(), salt_raw, &mut out)
        .map_err(|e| format!("No se pudo derivar clave: {e}"))?;

    // SQLCipher accepts passphrase. We'll use base64url to stay simple/ASCII.
    Ok(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(out))
}

fn open_encrypted_connection(db_path: &Path, key: &str) -> Result<Connection, String> {
    let conn = Connection::open(db_path).map_err(|e| format!("No se pudo abrir DB: {e}"))?;

    // Ensure SQLCipher parameters.
    // Use execute_batch because PRAGMA key can't be bound as a parameter.
    let key_escaped = key.replace('\'', "''");
    conn.execute_batch(&format!(
        "PRAGMA key='{}';\
         PRAGMA cipher_compatibility = 4;\
         PRAGMA foreign_keys = ON;",
        key_escaped
    ))
    .map_err(|e| format!("No se pudo configurar SQLCipher: {e}"))?;

    // Verify key by touching sqlite_master
    conn.query_row("SELECT count(*) FROM sqlite_master;", [], |_| Ok(()))
        .map_err(|e| format!("PIN incorrecto o DB corrupta: {e}"))?;

    Ok(conn)
}

fn read_migrations() -> Vec<(&'static str, &'static str)> {
    // (name, sql)
    vec![
        ("001_init.sql", include_str!("../migrations/001_init.sql")),
        ("002_seed.sql", include_str!("../migrations/002_seed.sql")),
        ("003_tags_notes.sql", include_str!("../migrations/003_tags_notes.sql")),
        ("004_notes_starred.sql", include_str!("../migrations/004_notes_starred.sql")),
        ("005_notes_kindle.sql", include_str!("../migrations/005_notes_kindle.sql")),
        ("006_space_checks.sql", include_str!("../migrations/006_space_checks.sql")),
        ("007_fix_module_order.sql", include_str!("../migrations/007_fix_module_order.sql")),
        ("008_notes_author.sql", include_str!("../migrations/008_notes_author.sql")),
        ("009_convenios_goals.sql", include_str!("../migrations/009_convenios_goals.sql")),
        ("010_cleanup_test_patients.sql", include_str!("../migrations/010_cleanup_test_patients.sql")),
    ]
}

fn ensure_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS __migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')));",
    )
    .map_err(|e| format!("No se pudo inicializar migraciones: {e}"))?;

    let applied: Vec<String> = {
        let mut stmt = conn
            .prepare("SELECT name FROM __migrations ORDER BY name")
            .map_err(|e| format!("No se pudo leer migraciones: {e}"))?;
        let rows = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| format!("No se pudo iterar migraciones: {e}"))?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| format!("No se pudo leer migración: {e}"))?);
        }
        out
    };

    for (name, sql) in read_migrations() {
        if applied.iter().any(|n| n == name) {
            continue;
        }
        if let Err(e) = conn.execute_batch(sql) {
            let msg = e.to_string();
            let ignore = msg.contains("duplicate column name")
                || msg.contains("already exists")
                || msg.contains("duplicate") && msg.contains("column");
            if !ignore {
                return Err(format!("Migración {name} falló: {msg}"));
            }
        }
        conn.execute(
            "INSERT INTO __migrations (name) VALUES (?)",
            [name],
        )
        .map_err(|e| format!("No se pudo registrar migración {name}: {e}"))?;
    }

    Ok(())
}

fn export_plaintext_to_encrypted(
    plaintext_path: &Path,
    encrypted_path: &Path,
    key: &str,
) -> Result<(), String> {
    // Open plaintext (no key). Then attach encrypted and export.
    let conn = Connection::open(plaintext_path)
        .map_err(|e| format!("No se pudo abrir DB antigua: {e}"))?;

    let key_escaped = key.replace('\'', "''");
    let enc_escaped = encrypted_path
        .to_string_lossy()
        .replace('\'', "''")
        .to_string();

    conn.execute_batch(&format!(
        "ATTACH DATABASE '{}' AS encrypted KEY '{}';\
         PRAGMA encrypted.cipher_compatibility = 4;\
         SELECT sqlcipher_export('encrypted');\
         DETACH DATABASE encrypted;",
        enc_escaped, key_escaped
    ))
    .map_err(|e| format!("No se pudo exportar a DB cifrada: {e}"))?;

    Ok(())
}

fn json_to_sql_value(v: &JsonValue) -> SqlValue {
    match v {
        JsonValue::Null => SqlValue::Null,
        JsonValue::Bool(b) => SqlValue::Integer(if *b { 1 } else { 0 }),
        JsonValue::Number(n) => {
            if let Some(i) = n.as_i64() {
                SqlValue::Integer(i)
            } else if let Some(f) = n.as_f64() {
                SqlValue::Real(f)
            } else {
                SqlValue::Text(n.to_string())
            }
        }
        JsonValue::String(s) => SqlValue::Text(s.clone()),
        // store objects/arrays as JSON strings
        _ => SqlValue::Text(v.to_string()),
    }
}

fn value_ref_to_json(v: ValueRef<'_>) -> JsonValue {
    match v {
        ValueRef::Null => JsonValue::Null,
        ValueRef::Integer(i) => json!(i),
        ValueRef::Real(f) => json!(f),
        ValueRef::Text(t) => JsonValue::String(String::from_utf8_lossy(t).to_string()),
        ValueRef::Blob(b) => JsonValue::String(base64::engine::general_purpose::STANDARD.encode(b)),
    }
}

fn with_conn<T>(f: impl FnOnce(&Connection) -> Result<T, String>) -> Result<T, String> {
    let guard = DB_CONN.lock().map_err(|_| "DB lock poisoned".to_string())?;
    let Some(conn) = guard.as_ref() else {
        return Err("DB bloqueada. Ingresa PIN para desbloquear.".to_string());
    };
    f(conn)
}

#[tauri::command]
pub fn db_status(app: tauri::AppHandle) -> Result<DbStatus, String> {
    migrate_legacy_app_data(&app)?;
    let keyinfo = read_keyinfo(&app)?;
    let enc = encrypted_db_path(&app)?;
    let plain = plaintext_db_path(&app)?;
    let unlocked = DB_CONN
        .lock()
        .map_err(|_| "DB lock poisoned".to_string())?
        .is_some();

    Ok(DbStatus {
        unlocked,
        needs_setup: keyinfo.is_none(),
        encrypted_db_exists: enc.exists(),
        plaintext_db_exists: plain.exists(),
    })
}

#[tauri::command]
pub fn db_lock() -> Result<(), String> {
    let mut guard = DB_CONN.lock().map_err(|_| "DB lock poisoned".to_string())?;
    *guard = None;
    Ok(())
}

/// Copia `telar.enc.db` (y keyinfo) a Documentos/Telar/respaldos/.
pub fn backup_encrypted_db(app: &tauri::AppHandle) -> Result<String, String> {
    let enc_path = encrypted_db_path(app)?;
    if !enc_path.exists() {
        return Err(
            "Aún no hay base de datos cifrada. Configura un PIN y desbloquea la app al menos una vez."
                .to_string(),
        );
    }

    let dir = app
        .path()
        .document_dir()
        .map_err(|e| format!("No se pudo resolver carpeta Documentos: {e}"))?
        .join("Telar")
        .join("respaldos");
    fs::create_dir_all(&dir).map_err(|e| format!("No se pudo crear carpeta de respaldos: {e}"))?;

    let stamp = std::process::Command::new("date")
        .args(["+%Y-%m-%d_%H%M%S"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "backup".to_string());

    let db_name = format!("telar.enc.{stamp}.db");
    let dest = dir.join(&db_name);
    fs::copy(&enc_path, &dest)
        .map_err(|e| format!("No se pudo copiar la base de datos: {e}"))?;

    let keyinfo = keyinfo_path(app)?;
    if keyinfo.exists() {
        let key_dest = dir.join(format!("secure.keyinfo.{stamp}.json"));
        let _ = fs::copy(&keyinfo, &key_dest);
    }

    Ok(dest.to_string_lossy().to_string())
}

/// Elimina todos los datos clínicos y de práctica. Conserva el esquema y el PIN de acceso.
#[tauri::command]
pub fn db_wipe_all_data() -> Result<(), String> {
    with_conn(|conn| {
        conn.execute_batch(
            "DELETE FROM patients;
             DELETE FROM convenios;
             UPDATE practice_goals SET goals_json = '{}', updated_at = datetime('now') WHERE id = 1;",
        )
        .map_err(|e| format!("Error al borrar datos: {e}"))?;
        Ok(())
    })
}

fn unlock_with_key(app: &tauri::AppHandle, key: &str) -> Result<(), String> {
    let enc_path = encrypted_db_path(app)?;
    let conn = open_encrypted_connection(&enc_path, key)?;
    ensure_schema(&conn)?;
    let mut guard = DB_CONN.lock().map_err(|_| "DB lock poisoned".to_string())?;
    *guard = Some(conn);
    Ok(())
}

fn prepare_encrypted_db(app: &tauri::AppHandle, key: &str) -> Result<(), String> {
    let cfg_dir = app_config_dir(app)?;
    let enc_path = encrypted_db_path(app)?;
    let plain_path = plaintext_db_path(app)?;

    if enc_path.exists() {
        return Ok(());
    }

    let _ = Connection::open(&enc_path).map_err(|e| format!("No se pudo crear DB cifrada: {e}"))?;

    if plain_path.exists() {
        export_plaintext_to_encrypted(&plain_path, &enc_path, key)?;
        let backup = cfg_dir.join("telar.plaintext.backup.db");
        let _ = fs::copy(&plain_path, &backup);
        let _ = fs::remove_file(&plain_path);
    }

    Ok(())
}

fn derive_key_from_pin(app: &tauri::AppHandle, pin: &str) -> Result<String, String> {
    let mut keyinfo = read_keyinfo(app)?;
    let cfg_dir = app_config_dir(app)?;
    fs::create_dir_all(&cfg_dir).map_err(|e| format!("No se pudo crear AppConfig dir: {e}"))?;

    if keyinfo.is_none() {
        let salt = SaltString::generate(&mut OsRng);
        let raw = salt.as_str().as_bytes().to_vec();
        let salt_b64 = base64::engine::general_purpose::STANDARD.encode(raw);
        let info = KeyInfo { salt_b64 };
        write_keyinfo(app, &info)?;
        keyinfo = Some(info);
    }

    let info = keyinfo.ok_or_else(|| "Keyinfo no disponible".to_string())?;
    let salt_raw = base64::engine::general_purpose::STANDARD
        .decode(info.salt_b64.as_bytes())
        .map_err(|e| format!("Salt inválida: {e}"))?;

    derive_db_key(pin, &salt_raw)
}

#[tauri::command]
pub fn db_unlock(
    app: tauri::AppHandle,
    pin: String,
    remember_touch_id: Option<bool>,
) -> Result<(), String> {
    check_pin_lockout()?;
    let key = derive_key_from_pin(&app, &pin)?;
    prepare_encrypted_db(&app, &key)?;
    match unlock_with_key(&app, &key) {
        Ok(()) => {
            reset_pin_lockout();
            if remember_touch_id == Some(true) {
                let path = touch_id_storage_path(&app)?;
                touch_id::save_db_key(&path, &key)?;
            }
            Ok(())
        }
        Err(e) => {
            record_pin_failure();
            Err(e)
        }
    }
}

#[tauri::command]
pub fn touch_id_available(app: tauri::AppHandle) -> bool {
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    if app
        .run_on_main_thread(move || {
            let _ = tx.send(touch_id::is_available());
        })
        .is_err()
    {
        return false;
    }
    rx.recv_timeout(std::time::Duration::from_secs(5))
        .unwrap_or(false)
}

#[tauri::command]
pub fn touch_id_has_stored_key(app: tauri::AppHandle) -> bool {
    touch_id_storage_path(&app)
        .map(|p| touch_id::has_stored_key(&p))
        .unwrap_or(false)
}

fn touch_id_authenticate_on_main(app: &tauri::AppHandle, reason: &str) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }

    let reason = reason.to_string();
    let (done_tx, done_rx) = std::sync::mpsc::sync_channel(1);
    app.run_on_main_thread(move || {
        let result = touch_id::authenticate_on_main_thread(&reason);
        let _ = done_tx.send(result);
    })
    .map_err(|e| format!("No se pudo iniciar Touch ID: {e}"))?;
    done_rx
        .recv()
        .map_err(|_| "Touch ID no respondió".to_string())?
}

#[tauri::command]
pub fn db_unlock_touch_id(app: tauri::AppHandle) -> Result<(), String> {
    touch_id_authenticate_on_main(&app, "Desbloquear Telar")?;
    let path = touch_id_storage_path(&app)?;
    let key = touch_id::load_db_key(&path)?;
    unlock_with_key(&app, &key)
}

/// Registra la clave en Keychain tras validar el PIN (app ya desbloqueada).
#[tauri::command]
pub fn touch_id_register_pin(app: tauri::AppHandle, pin: String) -> Result<(), String> {
    if !touch_id::is_available() {
        return Err("Touch ID no está disponible en este Mac".to_string());
    }

    check_pin_lockout()?;

    let enc_path = encrypted_db_path(&app)?;
    if !enc_path.exists() {
        return Err("Primero crea tu PIN desde la pantalla de desbloqueo".to_string());
    }

    let key = derive_key_from_pin(&app, &pin)?;
    match open_encrypted_connection(&enc_path, &key) {
        Ok(conn) => drop(conn),
        Err(e) => {
            record_pin_failure();
            return Err(e);
        }
    }

    touch_id_authenticate_on_main(
        &app,
        "Telar quiere usar Touch ID para desbloquear la app",
    )?;
    let path = touch_id_storage_path(&app)?;
    touch_id::save_db_key(&path, &key)
}

/// Muestra el diálogo nativo de Touch ID (sin desbloquear la base de datos).
#[tauri::command]
pub fn touch_id_prompt(app: tauri::AppHandle) -> Result<(), String> {
    touch_id_authenticate_on_main(&app, "Desbloquear Telar")
}

#[tauri::command]
pub fn touch_id_clear_stored_key(app: tauri::AppHandle) {
    if let Ok(path) = touch_id_storage_path(&app) {
        touch_id::clear_db_key(&path);
    }
}

#[derive(Debug, Deserialize)]
pub struct DbQueryArgs {
    pub query: String,
    pub values: Vec<JsonValue>,
}

#[tauri::command]
pub fn db_execute(args: DbQueryArgs) -> Result<(u64, i64), String> {
    validate_execute_sql(&args.query)?;
    with_conn(|conn| {
        let vals: Vec<SqlValue> = args.values.iter().map(json_to_sql_value).collect();
        let mut stmt = conn
            .prepare(&args.query)
            .map_err(|e| format!("SQL error: {e}"))?;
        let changed = stmt
            .execute(params_from_iter(vals.iter()))
            .map_err(|e| format!("SQL execute error: {e}"))?;
        let last_id = conn.last_insert_rowid();
        Ok((changed as u64, last_id))
    })
}

#[tauri::command]
pub fn db_select(args: DbQueryArgs) -> Result<Vec<HashMap<String, JsonValue>>, String> {
    validate_select_sql(&args.query)?;
    with_conn(|conn| {
        let vals: Vec<SqlValue> = args.values.iter().map(json_to_sql_value).collect();
        let mut stmt = conn
            .prepare(&args.query)
            .map_err(|e| format!("SQL error: {e}"))?;

        let col_count = stmt.column_count();
        let col_names: Vec<String> = (0..col_count)
            .map(|i| stmt.column_name(i).unwrap_or("").to_string())
            .collect();

        let mut rows = stmt
            .query(params_from_iter(vals.iter()))
            .map_err(|e| format!("SQL query error: {e}"))?;

        let mut out = Vec::new();
        while let Some(row) = rows.next().map_err(|e| format!("SQL rows error: {e}"))? {
            let mut map = HashMap::new();
            for idx in 0..col_count {
                let name = col_names.get(idx).cloned().unwrap_or_default();
                let v = row.get_ref(idx).map_err(|e| format!("SQL get_ref: {e}"))?;
                map.insert(name, value_ref_to_json(v));
            }
            out.push(map);
        }
        Ok(out)
    })
}

