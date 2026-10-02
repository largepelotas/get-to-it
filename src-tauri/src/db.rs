//! A thin SQLite executor for the frontend.
//!
//! The schema and queries live in TypeScript (`src/data/sqlite.ts`). This module
//! only runs statements, so a batch of changes can be applied in one real
//! transaction on a single connection.

use std::path::Path;
use std::sync::Mutex;

use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{params_from_iter, Connection};
use serde::Deserialize;
use serde_json::{Map, Number, Value};
use tauri::{AppHandle, Runtime};

pub struct Database {
    conn: Mutex<Connection>,
}

/// The app's database, or why it couldn't be opened.
pub struct DbState(pub Result<Database, String>);

impl DbState {
    fn get(&self) -> Result<&Database, String> {
        self.0.as_ref().map_err(Clone::clone)
    }
}

#[derive(Debug, Deserialize)]
pub struct Statement {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<Value>,
}

impl Database {
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        let conn = Connection::open(path)?;
        Self::configure(conn)
    }

    #[cfg(test)]
    pub fn open_in_memory() -> rusqlite::Result<Self> {
        Self::configure(Connection::open_in_memory()?)
    }

    fn configure(conn: Connection) -> rusqlite::Result<Self> {
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn select(&self, sql: &str, params: &[Value]) -> Result<Vec<Map<String, Value>>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
        let names: Vec<String> = stmt.column_names().iter().map(|n| n.to_string()).collect();
        let mut rows = stmt
            .query(params_from_iter(params.iter().map(to_sql)))
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let mut obj = Map::with_capacity(names.len());
            for (i, name) in names.iter().enumerate() {
                let value = row.get_ref(i).map_err(|e| e.to_string())?;
                obj.insert(name.clone(), from_sql(value));
            }
            out.push(obj);
        }
        Ok(out)
    }

    /// Runs every statement in one transaction. Nothing is applied if any fails.
    pub fn batch(&self, statements: &[Statement]) -> Result<(), String> {
        let mut conn = self.conn.lock().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for statement in statements {
            tx.execute(
                &statement.sql,
                params_from_iter(statement.params.iter().map(to_sql)),
            )
            .map_err(|e| format!("{e} (in: {})", statement.sql))?;
        }
        tx.commit().map_err(|e| e.to_string())
    }

    /// Writes a complete copy of the database to `target`, replacing any file there.
    pub fn copy_to(&self, target: &Path) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        if target.exists() {
            std::fs::remove_file(target).map_err(|e| e.to_string())?;
        }
        conn.execute("VACUUM INTO ?1", [target.to_string_lossy()])
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}

fn to_sql(value: &Value) -> SqlValue {
    match value {
        Value::Null => SqlValue::Null,
        Value::Bool(b) => SqlValue::Integer(i64::from(*b)),
        Value::Number(n) => match n.as_i64() {
            Some(i) => SqlValue::Integer(i),
            None => SqlValue::Real(n.as_f64().unwrap_or_default()),
        },
        Value::String(s) => SqlValue::Text(s.clone()),
        other => SqlValue::Text(other.to_string()),
    }
}

fn from_sql(value: ValueRef<'_>) -> Value {
    match value {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::Number(i.into()),
        ValueRef::Real(f) => Number::from_f64(f).map_or(Value::Null, Value::Number),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(b) => Value::String(String::from_utf8_lossy(b).into_owned()),
    }
}

#[tauri::command]
pub fn db_select(
    db: tauri::State<'_, DbState>,
    sql: String,
    params: Vec<Value>,
) -> Result<Vec<Map<String, Value>>, String> {
    db.get()?.select(&sql, &params)
}

#[tauri::command]
pub fn db_batch(db: tauri::State<'_, DbState>, statements: Vec<Statement>) -> Result<(), String> {
    db.get()?.batch(&statements)
}

/// Copies the database into the backups folder as `checklist-<label>.db`, before
/// a change to its structure. The label is letters, digits and dashes only.
#[tauri::command]
pub fn db_backup<R: Runtime>(
    app: AppHandle<R>,
    db: tauri::State<'_, DbState>,
    label: String,
) -> Result<(), String> {
    if label.is_empty() || !label.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(format!("invalid backup label: {label}"));
    }
    let dir = crate::files::backups_dir(&app)?;
    db.get()?
        .copy_to(&dir.join(format!("checklist-{label}.db")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn stmt(sql: &str, params: Vec<Value>) -> Statement {
        Statement {
            sql: sql.into(),
            params,
        }
    }

    #[test]
    fn round_trips_values() {
        let db = Database::open_in_memory().unwrap();
        db.batch(&[
            stmt(
                "CREATE TABLE t (a TEXT, b INTEGER, c REAL, d INTEGER)",
                vec![],
            ),
            stmt(
                "INSERT INTO t VALUES (?, ?, ?, ?)",
                vec![json!("hi"), json!(42), json!(1.5), json!(true)],
            ),
        ])
        .unwrap();
        let rows = db.select("SELECT * FROM t", &[]).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["a"], json!("hi"));
        assert_eq!(rows[0]["b"], json!(42));
        assert_eq!(rows[0]["c"], json!(1.5));
        assert_eq!(rows[0]["d"], json!(1));
    }

    #[test]
    fn copies_the_database_over_an_older_copy() {
        let dir = std::env::temp_dir().join(format!("checklist-db-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let target = dir.join("copy.db");
        let db = Database::open_in_memory().unwrap();
        db.batch(&[
            stmt("CREATE TABLE t (a TEXT)", vec![]),
            stmt("INSERT INTO t VALUES (?)", vec![json!("one")]),
        ])
        .unwrap();
        db.copy_to(&target).unwrap();
        db.batch(&[stmt("INSERT INTO t VALUES (?)", vec![json!("two")])])
            .unwrap();
        db.copy_to(&target).unwrap();
        let copy = Database::open(&target).unwrap();
        assert_eq!(copy.select("SELECT * FROM t", &[]).unwrap().len(), 2);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn batch_rolls_back_on_error() {
        let db = Database::open_in_memory().unwrap();
        db.batch(&[stmt("CREATE TABLE t (a TEXT PRIMARY KEY)", vec![])])
            .unwrap();
        let result = db.batch(&[
            stmt("INSERT INTO t VALUES (?)", vec![json!("x")]),
            stmt("INSERT INTO nope VALUES (?)", vec![json!("y")]),
        ]);
        assert!(result.is_err());
        let rows = db.select("SELECT * FROM t", &[]).unwrap();
        assert!(rows.is_empty());
    }
}
