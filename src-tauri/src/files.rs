//! File helpers for export, import and backups. The save and open dialogs
//! are shown from here, so the webview never names a path: it can only read
//! a file the user picked, or write where the user chose.

use std::fs;
use std::path::{Component, Path, PathBuf};

use serde::Deserialize;
use tauri::{AppHandle, Runtime};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

/// The kind of file a dialog offers, e.g. "Checklist export" with `json`.
#[derive(Debug, Deserialize)]
pub struct FileFilter {
    pub name: String,
    pub extensions: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct OutFile {
    /// Path relative to the chosen folder, using `/` separators.
    pub path: String,
    pub contents: String,
}

pub fn backups_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let dir = crate::data_dir(app)
        .map_err(|e| e.to_string())?
        .join("backups");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Joins `relative` onto `base`, refusing anything that would escape `base`.
pub fn safe_join(base: &Path, relative: &str) -> Result<PathBuf, String> {
    let rel = Path::new(relative);
    let mut out = base.to_path_buf();
    let mut parts = 0;
    for component in rel.components() {
        match component {
            Component::Normal(part) => {
                out.push(part);
                parts += 1;
            }
            Component::CurDir => {}
            _ => return Err(format!("invalid path: {relative}")),
        }
    }
    if parts == 0 {
        return Err(format!("invalid path: {relative}"));
    }
    Ok(out)
}

/// Deletes the oldest `.json` files in `dir` so at most `keep` remain.
/// Backup names embed a sortable timestamp, so name order is age order.
pub fn prune_backups(dir: &Path, keep: usize) -> Result<(), String> {
    let mut names: Vec<PathBuf> = fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|ext| ext == "json"))
        .collect();
    names.sort();
    if names.len() > keep {
        for old in &names[..names.len() - keep] {
            fs::remove_file(old).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Asks where to save a file and writes it there. Returns false if the user cancelled.
#[tauri::command]
pub async fn save_text_file<R: Runtime>(
    app: AppHandle<R>,
    default_name: String,
    contents: String,
    filter: FileFilter,
) -> Result<bool, String> {
    let extensions: Vec<&str> = filter.extensions.iter().map(String::as_str).collect();
    let picked = app
        .dialog()
        .file()
        .set_file_name(default_name)
        .add_filter(filter.name, &extensions)
        .blocking_save_file();
    let Some(path) = picked else {
        return Ok(false);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    fs::write(path, contents).map_err(|e| e.to_string())?;
    Ok(true)
}

/// Asks for a file and returns what's in it, or `None` if the user cancelled.
#[tauri::command]
pub async fn open_text_file<R: Runtime>(
    app: AppHandle<R>,
    filter: FileFilter,
) -> Result<Option<String>, String> {
    let extensions: Vec<&str> = filter.extensions.iter().map(String::as_str).collect();
    let picked = app
        .dialog()
        .file()
        .add_filter(filter.name, &extensions)
        .blocking_pick_file();
    let Some(path) = picked else {
        return Ok(None);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    fs::read_to_string(path)
        .map(Some)
        .map_err(|e| e.to_string())
}

/// Writes `files` under `base`, making folders as needed. A path that would leave `base` is refused.
pub fn write_files_into(base: &Path, files: &[OutFile]) -> Result<(), String> {
    for file in files {
        let target = safe_join(base, &file.path)?;
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&target, &file.contents).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Asks for a folder and writes the files into it. Returns false if the user cancelled.
#[tauri::command]
pub async fn save_files<R: Runtime>(
    app: AppHandle<R>,
    title: String,
    files: Vec<OutFile>,
) -> Result<bool, String> {
    let picked = app.dialog().file().set_title(title).blocking_pick_folder();
    let Some(dir) = picked else {
        return Ok(false);
    };
    let base = dir.into_path().map_err(|e| e.to_string())?;
    write_files_into(&base, &files)?;
    Ok(true)
}

/// Writes a backup into the app's data folder and keeps the newest `keep`.
/// Returns the full path of the new backup.
#[tauri::command]
pub fn write_backup<R: Runtime>(
    app: AppHandle<R>,
    name: String,
    contents: String,
    keep: usize,
) -> Result<String, String> {
    if name.contains(['/', '\\']) || !name.ends_with(".json") {
        return Err(format!("invalid backup name: {name}"));
    }
    let dir = backups_dir(&app)?;
    let target = dir.join(&name);
    fs::write(&target, contents).map_err(|e| e.to_string())?;
    prune_backups(&dir, keep.max(1))?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn open_backups_folder<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let dir = backups_dir(&app)?;
    app.opener()
        .open_path(dir.to_string_lossy(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_join_accepts_nested_relative_paths() {
        let base = Path::new("/tmp/export");
        assert_eq!(
            safe_join(base, "Work/Plan.md").unwrap(),
            PathBuf::from("/tmp/export/Work/Plan.md")
        );
    }

    #[test]
    fn safe_join_rejects_escapes() {
        let base = Path::new("/tmp/export");
        assert!(safe_join(base, "../etc/passwd").is_err());
        assert!(safe_join(base, "/etc/passwd").is_err());
        assert!(safe_join(base, "").is_err());
    }

    #[test]
    fn writes_files_into_folders_and_refuses_to_leave_the_base() {
        let dir = std::env::temp_dir().join(format!("checklist-files-{}", std::process::id()));
        let file = |path: &str| OutFile {
            path: path.into(),
            contents: "x".into(),
        };
        write_files_into(&dir, &[file("Export/Work/Plan.md")]).unwrap();
        assert!(dir.join("Export/Work/Plan.md").exists());
        assert!(write_files_into(&dir, &[file("../escape.md")]).is_err());
        assert!(!dir.parent().unwrap().join("escape.md").exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn prune_keeps_newest() {
        let dir = std::env::temp_dir().join(format!("checklist-prune-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        for name in [
            "b-2026-01-01.json",
            "b-2026-01-02.json",
            "b-2026-01-03.json",
            "note.txt",
        ] {
            fs::write(dir.join(name), "{}").unwrap();
        }
        prune_backups(&dir, 2).unwrap();
        let mut left: Vec<String> = fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        left.sort();
        assert_eq!(
            left,
            vec!["b-2026-01-02.json", "b-2026-01-03.json", "note.txt"]
        );
        fs::remove_dir_all(&dir).unwrap();
    }
}
