//! Fetching calendar links (ICS feeds). This is the app's only network use, so
//! it stays narrow: https only, GET only, and the body must look like a
//! calendar, so the webview can't use it as a general-purpose fetcher.
//!
//! The link is a secret (anyone holding it can read the calendar), so no error
//! message or log line ever contains it.

use std::time::Duration;

use reqwest::redirect::Policy;

const TIMEOUT: Duration = Duration::from_secs(20);
const MAX_REDIRECTS: usize = 5;
const MAX_BYTES: usize = 10 * 1024 * 1024;

/// Turns a `webcal://` link into `https://` and refuses anything that isn't https.
fn normalize_url(url: &str) -> Result<String, String> {
    let url = url.trim();
    let lower = url.to_ascii_lowercase();
    let rest = if lower.starts_with("webcal://") {
        &url["webcal://".len()..]
    } else if lower.starts_with("https://") {
        &url["https://".len()..]
    } else {
        return Err("The calendar link must start with https:// or webcal://.".into());
    };
    if rest.is_empty() {
        return Err("The calendar link is incomplete.".into());
    }
    Ok(format!("https://{rest}"))
}

/// True if the text, after an optional byte order mark and whitespace, starts like a calendar.
fn looks_like_calendar(body: &str) -> bool {
    body.trim_start_matches('\u{feff}')
        .trim_start()
        .get(.."BEGIN:VCALENDAR".len())
        .is_some_and(|start| start.eq_ignore_ascii_case("BEGIN:VCALENDAR"))
}

#[tauri::command]
pub async fn fetch_calendar_feed(url: String) -> Result<String, String> {
    let url = normalize_url(&url)?;
    let policy = Policy::custom(|attempt| {
        if attempt.previous().len() >= MAX_REDIRECTS {
            attempt.error("too many redirects")
        } else if attempt.url().scheme() != "https" {
            attempt.error("redirect to a link that isn't https")
        } else {
            attempt.follow()
        }
    });
    let client = reqwest::Client::builder()
        .timeout(TIMEOUT)
        .redirect(policy)
        .build()
        .map_err(|_| "The calendar couldn’t be fetched.".to_string())?;
    // `reqwest` errors can carry the URL, so they are replaced, never passed on.
    let mut response = client.get(url).send().await.map_err(|e| {
        if e.is_timeout() {
            "The calendar took too long to answer.".to_string()
        } else if e.is_redirect() {
            "The calendar link redirected somewhere it shouldn’t.".to_string()
        } else {
            "Couldn’t reach the calendar. Check your connection and the link.".to_string()
        }
    })?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!(
            "The calendar server answered with an error ({}).",
            status.as_u16()
        ));
    }
    let mut bytes: Vec<u8> = Vec::new();
    loop {
        let chunk = response
            .chunk()
            .await
            .map_err(|_| "The calendar download was interrupted.".to_string())?;
        let Some(chunk) = chunk else { break };
        if bytes.len() + chunk.len() > MAX_BYTES {
            return Err("The calendar is too large (over 10 MB).".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let body = String::from_utf8_lossy(&bytes).into_owned();
    if !looks_like_calendar(&body) {
        return Err("That link didn’t return a calendar.".into());
    }
    Ok(body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn https_links_pass_unchanged() {
        assert_eq!(
            normalize_url("https://example.test/a.ics").unwrap(),
            "https://example.test/a.ics"
        );
    }

    #[test]
    fn webcal_links_become_https() {
        assert_eq!(
            normalize_url("  webcal://example.test/a.ics ").unwrap(),
            "https://example.test/a.ics"
        );
        assert_eq!(
            normalize_url("WEBCAL://example.test/a.ics").unwrap(),
            "https://example.test/a.ics"
        );
    }

    // A plain http, file or other link must be refused before any connection is made,
    // or the command would let the page reach anywhere.
    #[test]
    fn other_links_are_refused() {
        for bad in [
            "http://example.test/a.ics",
            "file:///etc/passwd",
            "ftp://example.test/a.ics",
            "example.test/a.ics",
            "https://",
            "webcal://",
            "",
        ] {
            assert!(normalize_url(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn errors_never_contain_the_link() {
        let err = normalize_url("http://secret.example.test/token123").unwrap_err();
        assert!(!err.contains("secret") && !err.contains("token123"));
    }

    // A page that isn't a calendar must not be handed back to the webview.
    #[test]
    fn only_calendar_bodies_are_accepted() {
        assert!(looks_like_calendar("BEGIN:VCALENDAR\r\nEND:VCALENDAR"));
        assert!(looks_like_calendar("\u{feff}\r\n  BEGIN:VCALENDAR\r\n"));
        assert!(!looks_like_calendar("<html>BEGIN:VCALENDAR</html>"));
        assert!(!looks_like_calendar(""));
        assert!(!looks_like_calendar("é"));
    }
}
