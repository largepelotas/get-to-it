mod db;
mod files;
mod reminders;
mod tray;

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, RunEvent, Runtime, WindowEvent};

pub const MAIN_WINDOW: &str = "main";
const QUIT_REQUESTED_EVENT: &str = "app://quit-requested";
/// Passed by the launch-at-login entry so the app starts in the tray.
const HIDDEN_ARG: &str = "--hidden";

pub struct AppState {
    close_to_tray: AtomicBool,
    quit_requested: AtomicBool,
    quitting: AtomicBool,
    start_hidden: bool,
}

pub fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Asks the frontend to save pending changes and then call `quit_app`.
/// Exits anyway after a few seconds in case the frontend doesn't respond.
pub fn request_quit<R: Runtime>(app: &AppHandle<R>) {
    let state = app.state::<AppState>();
    if state.quit_requested.swap(true, Ordering::SeqCst) {
        return;
    }
    if app.emit_to(MAIN_WINDOW, QUIT_REQUESTED_EVENT, ()).is_err() {
        state.quitting.store(true, Ordering::SeqCst);
        app.exit(0);
        return;
    }
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(3));
        handle
            .state::<AppState>()
            .quitting
            .store(true, Ordering::SeqCst);
        handle.exit(0);
    });
}

#[tauri::command]
fn quit_app<R: Runtime>(app: AppHandle<R>, state: tauri::State<'_, AppState>) {
    state.quitting.store(true, Ordering::SeqCst);
    app.exit(0);
}

#[tauri::command]
fn set_close_to_tray(state: tauri::State<'_, AppState>, enabled: bool) {
    state.close_to_tray.store(enabled, Ordering::SeqCst);
}

/// Called by the frontend once its first screen has rendered, so the window
/// never flashes blank. Stays hidden when launched at login.
#[tauri::command]
fn app_ready<R: Runtime>(app: AppHandle<R>, state: tauri::State<'_, AppState>) {
    if !state.start_hidden {
        show_main_window(&app);
    }
}

#[tauri::command]
fn show_window<R: Runtime>(app: AppHandle<R>) {
    show_main_window(&app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let start_hidden = std::env::args().any(|arg| arg == HIDDEN_ARG);

    let builder = tauri::Builder::default();
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![HIDDEN_ARG]),
        ))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        - tauri_plugin_window_state::StateFlags::VISIBLE,
                )
                .build(),
        );

    let app = builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(AppState {
            close_to_tray: AtomicBool::new(true),
            quit_requested: AtomicBool::new(false),
            quitting: AtomicBool::new(false),
            start_hidden,
        })
        .manage(reminders::Scheduler::default())
        .invoke_handler(tauri::generate_handler![
            db::db_select,
            db::db_batch,
            reminders::set_reminder_schedule,
            files::write_text_file,
            files::read_text_file,
            files::write_files,
            files::write_backup,
            files::open_backups_folder,
            tray::set_tray_tooltip,
            quit_app,
            set_close_to_tray,
            app_ready,
            show_window,
        ])
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let database = db::Database::open(&data_dir.join("checklist.db"))
                .map_err(|e| format!("could not open the database: {e}"))?;
            app.manage(database);

            #[cfg(desktop)]
            tray::create(app.handle())?;
            reminders::start(app.handle().clone());

            // Fallback in case the frontend never reports that it's ready.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(4));
                if !handle.state::<AppState>().start_hidden {
                    if let Some(window) = handle.get_webview_window(MAIN_WINDOW) {
                        if !window.is_visible().unwrap_or(true) {
                            show_main_window(&handle);
                        }
                    }
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != MAIN_WINDOW {
                return;
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let app = window.app_handle();
                if app.state::<AppState>().close_to_tray.load(Ordering::SeqCst) {
                    let _ = window.hide();
                } else {
                    request_quit(app);
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building the app");

    app.run(|app, event| match event {
        // `code` is None when the user asked to quit (e.g. Cmd+Q). Give the
        // frontend a chance to save first.
        RunEvent::ExitRequested {
            code: None, api, ..
        } if !app.state::<AppState>().quitting.load(Ordering::SeqCst) => {
            api.prevent_exit();
            request_quit(app);
        }
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => show_main_window(app),
        _ => {}
    });
}
