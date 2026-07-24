use std::collections::HashMap;

use base64::Engine;
use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{params_from_iter, Connection};
use serde::Deserialize;
use serde_json::{json, Value as JsonValue};

#[derive(Debug, Deserialize)]
pub struct DbQueryArgs {
    pub query: String,
    pub values: Vec<JsonValue>,
}

fn validate_select_sql(sql: &str) -> Result<(), String> {
    let first = sql
        .trim()
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_uppercase();
    match first.as_str() {
        "SELECT" | "WITH" => Ok(()),
        kw => Err(format!(
            "Tipo de consulta no permitido: {kw}. Solo SELECT/WITH."
        )),
    }
}

fn validate_execute_sql(sql: &str) -> Result<(), String> {
    let first = sql
        .trim()
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_uppercase();
    match first.as_str() {
        "INSERT" | "UPDATE" | "DELETE" => Ok(()),
        kw => Err(format!(
            "Operación no permitida: {kw}. Solo INSERT/UPDATE/DELETE."
        )),
    }
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
        // Store objects/arrays as JSON strings.
        _ => SqlValue::Text(v.to_string()),
    }
}

fn value_ref_to_json(v: ValueRef<'_>) -> JsonValue {
    match v {
        ValueRef::Null => JsonValue::Null,
        ValueRef::Integer(i) => json!(i),
        ValueRef::Real(f) => json!(f),
        ValueRef::Text(t) => JsonValue::String(String::from_utf8_lossy(t).to_string()),
        ValueRef::Blob(b) => {
            JsonValue::String(base64::engine::general_purpose::STANDARD.encode(b))
        }
    }
}

pub fn execute(conn: &Connection, args: DbQueryArgs) -> Result<(u64, i64), String> {
    validate_execute_sql(&args.query)?;
    let vals: Vec<SqlValue> = args.values.iter().map(json_to_sql_value).collect();
    let mut stmt = conn
        .prepare(&args.query)
        .map_err(|e| format!("SQL error: {e}"))?;
    let changed = stmt
        .execute(params_from_iter(vals.iter()))
        .map_err(|e| format!("SQL execute error: {e}"))?;
    let last_id = conn.last_insert_rowid();
    Ok((changed as u64, last_id))
}

pub fn select(
    conn: &Connection,
    args: DbQueryArgs,
) -> Result<Vec<HashMap<String, JsonValue>>, String> {
    validate_select_sql(&args.query)?;
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
}

#[cfg(test)]
mod tests {
    use super::{validate_execute_sql, validate_select_sql};

    #[test]
    fn sql_allowlist_select() {
        assert!(validate_select_sql("SELECT 1").is_ok());
        assert!(validate_select_sql("  with x as (select 1) select * from x").is_ok());
        assert!(validate_select_sql("DELETE FROM patients").is_err());
    }

    #[test]
    fn sql_allowlist_execute() {
        assert!(validate_execute_sql("INSERT INTO t VALUES (1)").is_ok());
        assert!(validate_execute_sql("UPDATE t SET x=1").is_ok());
        assert!(validate_execute_sql("SELECT 1").is_err());
    }
}
