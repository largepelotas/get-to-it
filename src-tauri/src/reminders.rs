//! Reminder scheduling.
//!
//! The frontend decides which reminders are due and when, then hands the list
//! to [`set_reminder_schedule`]. A background thread fires each one as a
//! desktop notification and tells the frontend with a `reminder://fired`
//! event. The thread lives on the native side so a hidden or throttled window
//! can't delay reminders.

use std::sync::Mutex;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_notification::NotificationExt;

pub const FIRED_EVENT: &str = "reminder://fired";

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledReminder {
    pub id: String,
    /// Unix time in milliseconds.
    pub at: i64,
    pub title: String,
    pub body: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FiredReminder {
    id: String,
    at: i64,
}

#[derive(Default)]
pub struct Scheduler {
    entries: Mutex<Vec<ScheduledReminder>>,
}

impl Scheduler {
    pub fn replace(&self, entries: Vec<ScheduledReminder>) {
        if let Ok(mut current) = self.entries.lock() {
            *current = entries;
        }
    }

    /// Removes and returns every reminder due at or before `now`.
    pub fn take_due(&self, now: i64) -> Vec<ScheduledReminder> {
        let Ok(mut entries) = self.entries.lock() else {
            return Vec::new();
        };
        let (due, pending): (Vec<_>, Vec<_>) = entries.drain(..).partition(|r| r.at <= now);
        *entries = pending;
        due
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or_default()
}

/// Starts the scheduler thread. It checks the wall clock every second rather
/// than sleeping until the next reminder, so reminders still fire promptly
/// after the computer wakes from sleep.
pub fn start<R: Runtime>(app: AppHandle<R>) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(1));
        let due = app.state::<Scheduler>().take_due(now_ms());
        for reminder in due {
            fire(&app, reminder);
        }
    });
}

fn fire<R: Runtime>(app: &AppHandle<R>, reminder: ScheduledReminder) {
    let mut builder = app
        .notification()
        .builder()
        .title(&reminder.title)
        .body(&reminder.body);
    if cfg!(target_os = "macos") {
        builder = builder.sound("default");
    }
    if let Err(err) = builder.show() {
        eprintln!("failed to show notification: {err}");
    }
    let _ = app.emit(
        FIRED_EVENT,
        FiredReminder {
            id: reminder.id,
            at: reminder.at,
        },
    );
}

#[tauri::command]
pub fn set_reminder_schedule(
    scheduler: tauri::State<'_, Scheduler>,
    entries: Vec<ScheduledReminder>,
) {
    scheduler.replace(entries);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reminder(id: &str, at: i64) -> ScheduledReminder {
        ScheduledReminder {
            id: id.into(),
            at,
            title: "t".into(),
            body: "b".into(),
        }
    }

    #[test]
    fn takes_only_due_reminders() {
        let scheduler = Scheduler::default();
        scheduler.replace(vec![
            reminder("a", 100),
            reminder("b", 200),
            reminder("c", 300),
        ]);
        let due = scheduler.take_due(200);
        assert_eq!(due, vec![reminder("a", 100), reminder("b", 200)]);
        assert!(scheduler.take_due(250).is_empty());
        assert_eq!(scheduler.take_due(1000), vec![reminder("c", 300)]);
    }

    #[test]
    fn replace_discards_old_entries() {
        let scheduler = Scheduler::default();
        scheduler.replace(vec![reminder("a", 100)]);
        scheduler.replace(vec![reminder("b", 100)]);
        assert_eq!(scheduler.take_due(100), vec![reminder("b", 100)]);
    }
}
