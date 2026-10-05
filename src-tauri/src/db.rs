//! A thin SQLite executor for the frontend.
//!
//! The schema and queries live in TypeScript (`src/data/sqlite.ts`). This module
//! only runs statements, so a batch of changes can be applied in one real
//! transaction on a single connection.

use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use rusqlite::backup::Backup;
use rusqlite::config::DbConfig;
use rusqlite::hooks::{AuthAction, AuthContext, Authorization};
use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{params_from_iter, Connection};
use serde::Deserialize;
use serde_json::{Map, Number, Value};
use tauri::{AppHandle, Runtime};

pub struct Database {
    conn: Mutex<Connection>,
    /// True only while `batch` runs its own BEGIN/COMMIT/ROLLBACK; see `configure`.
    own_transaction: Arc<AtomicBool>,
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
        // The app's own setup pragmas run first, before the authorizer exists.
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        // DEFENSIVE makes SQLite itself refuse the dangerous switches (writable_schema,
        // writes to shadow tables, corrupting the file). TRUSTED_SCHEMA off stops
        // functions in views, triggers and defaults from running unvetted.
        conn.set_db_config(DbConfig::SQLITE_DBCONFIG_DEFENSIVE, true)?;
        conn.set_db_config(DbConfig::SQLITE_DBCONFIG_TRUSTED_SCHEMA, false)?;
        // The webview sends SQL, so it must not be able to name a file or reach
        // past the one transaction `batch` opens. The authorizer runs while a
        // statement is prepared, before `select` can check `readonly()`:
        //  - ATTACH/DETACH: opens or creates any path.
        //  - Pragma: only `user_version` (the migration counter) is allowed, so
        //    temp_store_directory, writable_schema and the like are refused.
        //  - Transaction/Savepoint: a COMMIT inside a batch would leave later
        //    statements in autocommit, where VACUUM INTO could write any path.
        //    Only `batch`'s own BEGIN/COMMIT/ROLLBACK pass, via `own_transaction`.
        let own_transaction = Arc::new(AtomicBool::new(false));
        let own = Arc::clone(&own_transaction);
        conn.authorizer(Some(move |ctx: AuthContext<'_>| match ctx.action {
            AuthAction::Attach { .. } | AuthAction::Detach { .. } => Authorization::Deny,
            AuthAction::Pragma { pragma_name, .. }
                if pragma_name.eq_ignore_ascii_case("user_version") =>
            {
                Authorization::Allow
            }
            AuthAction::Pragma { .. } => Authorization::Deny,
            AuthAction::Transaction { .. } | AuthAction::Savepoint { .. }
                if !own.load(Ordering::SeqCst) =>
            {
                Authorization::Deny
            }
            _ => Authorization::Allow,
        }))?;
        Ok(Self {
            conn: Mutex::new(conn),
            own_transaction,
        })
    }

    pub fn select(&self, sql: &str, params: &[Value]) -> Result<Vec<Map<String, Value>>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
        if !stmt.readonly() {
            return Err(format!("select refused a statement that writes: {sql}"));
        }
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
        let flag = &self.own_transaction;
        flag.store(true, Ordering::SeqCst);
        let tx = conn.transaction();
        flag.store(false, Ordering::SeqCst);
        let tx = tx.map_err(|e| e.to_string())?;
        let result = (|| -> Result<(), String> {
            for statement in statements {
                tx.execute(
                    &statement.sql,
                    params_from_iter(statement.params.iter().map(to_sql)),
                )
                .map_err(|e| format!("{e} (in: {})", statement.sql))?;
            }
            Ok(())
        })();
        flag.store(true, Ordering::SeqCst);
        let ended = if result.is_ok() {
            tx.commit()
        } else {
            tx.rollback()
        };
        flag.store(false, Ordering::SeqCst);
        result?;
        ended.map_err(|e| e.to_string())
    }

    /// Writes a complete copy of the database to `target`, replacing any file there.
    /// The copy is built beside it as `<name>.tmp` and renamed into place only once
    /// complete, so a failed copy leaves the previous one untouched.
    pub fn copy_to(&self, target: &Path) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut name = target.as_os_str().to_owned();
        name.push(".tmp");
        let temp = std::path::PathBuf::from(name);
        let result = Self::build_copy(&conn, &temp)
            .and_then(|()| std::fs::rename(&temp, target).map_err(|e| e.to_string()));
        if result.is_err() {
            for suffix in ["", "-wal", "-shm", "-journal"] {
                let mut p = temp.as_os_str().to_owned();
                p.push(suffix);
                let _ = std::fs::remove_file(p);
            }
        }
        result
    }

    fn build_copy(conn: &Connection, temp: &Path) -> Result<(), String> {
        if temp.exists() {
            std::fs::remove_file(temp).map_err(|e| e.to_string())?;
        }
        let mut copy = Connection::open(temp).map_err(|e| e.to_string())?;
        {
            let backup = Backup::new(conn, &mut copy).map_err(|e| e.to_string())?;
            backup
                .run_to_completion(256, std::time::Duration::from_millis(10), None)
                .map_err(|e| e.to_string())?;
        }
        // Closing the connection checkpoints and removes any -wal/-shm, so the
        // renamed file is the whole database.
        copy.close().map_err(|(_, e)| e.to_string())
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

// `async` makes Tauri run these on its thread pool; a plain command runs on the
// main thread and a slow query or file write would freeze the window.
#[tauri::command(async)]
pub fn db_select(
    db: tauri::State<'_, DbState>,
    sql: String,
    params: Vec<Value>,
) -> Result<Vec<Map<String, Value>>, String> {
    db.get()?.select(&sql, &params)
}

#[tauri::command(async)]
pub fn db_batch(db: tauri::State<'_, DbState>, statements: Vec<Statement>) -> Result<(), String> {
    db.get()?.batch(&statements)
}

/// Copies the database into the backups folder as `gettoit-<label>.db`, before
/// a change to its structure. The label is letters, digits and dashes only.
#[tauri::command(async)]
pub fn db_backup<R: Runtime>(
    app: AppHandle<R>,
    db: tauri::State<'_, DbState>,
    label: String,
) -> Result<(), String> {
    if label.is_empty() || !label.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err(format!("invalid backup label: {label}"));
    }
    let dir = crate::files::backups_dir(&app)?;
    db.get()?.copy_to(&dir.join(format!("gettoit-{label}.db")))
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

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("gettoit-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    // An in-memory source hides WAL and file-handling bugs, so the source is a real
    // WAL file and the copy is read back as a separate database.
    #[test]
    fn copies_a_wal_file_database_over_an_older_copy() {
        let dir = temp_dir("copy");
        let target = dir.join("copy.db");
        let db = Database::open(&dir.join("source.db")).unwrap();
        db.batch(&[
            stmt("CREATE TABLE t (a TEXT)", vec![]),
            stmt("INSERT INTO t VALUES (?)", vec![json!("one")]),
        ])
        .unwrap();
        db.copy_to(&target).unwrap();
        db.batch(&[stmt("INSERT INTO t VALUES (?)", vec![json!("two")])])
            .unwrap();
        db.copy_to(&target).unwrap();
        assert!(!dir.join("copy.db.tmp").exists());
        // journal_mode is not allowed through the guarded connection; read the file.
        let mode: String = Connection::open(dir.join("source.db"))
            .unwrap()
            .query_row("PRAGMA journal_mode", [], |r| r.get(0))
            .unwrap();
        assert_eq!(mode, "wal");
        let copy = Database::open(&target).unwrap();
        let rows = copy.select("SELECT a FROM t ORDER BY a", &[]).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[1]["a"], json!("two"));
        drop(copy);
        drop(db);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    // Deleting the old copy before the new one succeeded lost both on a failure.
    #[test]
    fn a_failed_copy_leaves_the_existing_copy_alone() {
        let dir = temp_dir("copy-fail");
        let target = dir.join("copy.db");
        let db = Database::open(&dir.join("source.db")).unwrap();
        db.batch(&[
            stmt("CREATE TABLE t (a TEXT)", vec![]),
            stmt("INSERT INTO t VALUES (?)", vec![json!("one")]),
        ])
        .unwrap();
        db.copy_to(&target).unwrap();
        // A directory where the temp file belongs makes the next copy fail.
        std::fs::create_dir(dir.join("copy.db.tmp")).unwrap();
        db.batch(&[stmt("INSERT INTO t VALUES (?)", vec![json!("two")])])
            .unwrap();
        assert!(db.copy_to(&target).is_err());
        let copy = Database::open(&target).unwrap();
        assert_eq!(copy.select("SELECT * FROM t", &[]).unwrap().len(), 1);
        drop(copy);
        drop(db);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    fn db_with_table() -> Database {
        let db = Database::open_in_memory().unwrap();
        db.batch(&[stmt("CREATE TABLE t (a TEXT)", vec![])])
            .unwrap();
        db
    }

    // A select that writes would let the webview change data through the read path.
    #[test]
    fn select_refuses_a_write_statement() {
        let db = db_with_table();
        assert!(db.select("INSERT INTO t VALUES ('x')", &[]).is_err());
        assert!(db.select("DROP TABLE t", &[]).is_err());
        assert!(db.select("SELECT * FROM t", &[]).unwrap().is_empty());
    }

    // ATTACH opens or creates any file the SQL names.
    #[test]
    fn attach_is_refused_by_select_and_batch() {
        let db = db_with_table();
        let file = std::env::temp_dir().join(format!("gettoit-attach-{}.db", std::process::id()));
        let sql = format!("ATTACH DATABASE '{}' AS x", file.display());
        assert!(db.select(&sql, &[]).is_err());
        assert!(db.batch(&[stmt(&sql, vec![])]).is_err());
        assert!(!file.exists());
    }

    // VACUUM INTO writes a copy of the database to any path the SQL names.
    #[test]
    fn vacuum_into_is_refused() {
        let db = db_with_table();
        let file = std::env::temp_dir().join(format!("gettoit-vacuum-{}.db", std::process::id()));
        let sql = format!("VACUUM INTO '{}'", file.display());
        assert!(db.select(&sql, &[]).is_err());
        assert!(db.batch(&[stmt(&sql, vec![])]).is_err());
        assert!(!file.exists());
    }

    // COMMIT ends batch's transaction, so a VACUUM INTO after it would run in
    // autocommit and write any path. The authorizer refuses the COMMIT itself.
    #[test]
    fn commit_inside_a_batch_cannot_reach_autocommit() {
        let db = db_with_table();
        let file = std::env::temp_dir().join(format!("gettoit-commit-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&file);
        let vacuum = format!("VACUUM INTO '{}'", file.display());
        assert!(db
            .batch(&[stmt("COMMIT", vec![]), stmt(&vacuum, vec![])])
            .is_err());
        assert!(db.batch(&[stmt("SAVEPOINT a", vec![])]).is_err());
        assert!(db.batch(&[stmt("BEGIN", vec![])]).is_err());
        assert!(!file.exists());
        // The connection is still usable afterwards.
        db.batch(&[stmt("INSERT INTO t VALUES ('x')", vec![])])
            .unwrap();
    }

    // temp_store_directory redirects temp files to any path; writable_schema lets
    // SQL edit the schema table directly. Both must fail before they take effect.
    #[test]
    fn dangerous_pragmas_are_refused_by_select_and_batch() {
        let db = db_with_table();
        let dir = std::env::temp_dir().display().to_string();
        for sql in [
            format!("PRAGMA temp_store_directory = '{dir}'"),
            "PRAGMA writable_schema = ON".to_string(),
            "PRAGMA journal_mode = DELETE".to_string(),
        ] {
            assert!(db.select(&sql, &[]).is_err(), "select allowed {sql}");
            assert!(
                db.batch(&[stmt(&sql, vec![])]).is_err(),
                "batch allowed {sql}"
            );
        }
        // Read it back on the same connection, with the authorizer lifted for the check.
        let conn = db.conn.lock().unwrap();
        conn.authorizer(None::<fn(AuthContext<'_>) -> Authorization>)
            .unwrap();
        let on: i64 = conn
            .query_row("PRAGMA writable_schema", [], |r| r.get(0))
            .unwrap();
        assert_eq!(on, 0);
    }

    // DEFENSIVE is a second guard behind the authorizer; setting a flag to the value
    // it already has returns that value.
    #[test]
    fn defensive_is_on_and_trusted_schema_is_off() {
        let db = db_with_table();
        let conn = db.conn.lock().unwrap();
        assert!(conn
            .set_db_config(DbConfig::SQLITE_DBCONFIG_DEFENSIVE, true)
            .unwrap());
        assert!(!conn
            .set_db_config(DbConfig::SQLITE_DBCONFIG_TRUSTED_SCHEMA, false)
            .unwrap());
    }

    #[test]
    fn normal_select_and_batch_still_work() {
        let db = db_with_table();
        db.batch(&[
            stmt("INSERT INTO t VALUES (?)", vec![json!("a")]),
            stmt("PRAGMA user_version = 3", vec![]),
        ])
        .unwrap();
        assert_eq!(db.select("SELECT * FROM t", &[]).unwrap().len(), 1);
        let rows = db.select("PRAGMA user_version", &[]).unwrap();
        assert_eq!(rows[0]["user_version"], json!(3));
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
