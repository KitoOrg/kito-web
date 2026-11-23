//! `kito-web`: Kito in a browser.
//!
//! A plugin of Kito (ADR 0005 there): `kito web` starts it in a
//! repository, with what it needs to reach that repository's daemon in
//! its environment. It serves a web client it carries inside, on this
//! machine only, to whoever opens the address it prints, and passes what
//! the client asks on to the daemon, which answers it what the repository
//! gave this plugin.
//!
//! ```text
//! kito web [--port N]
//! ```
//!
//! A Kito server that enabled it runs it as `kito-web serve-pages`
//! instead, for a team: see `team.rs`.

mod daemon;
mod team;

use axum::extract::{Query, Request, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode, Uri};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use daemon::Daemon;
use serde::Deserialize;
use serde_json::{json, Value};
use std::process::ExitCode;
use std::sync::Arc;
use std::time::Duration;

/// The web client, built by `npm run build` in `frontend/`.
#[derive(rust_embed::RustEmbed)]
#[folder = "frontend/dist"]
struct Client;

/// The port asked for when none is said.
const PORT: u16 = 7423;

/// What the browser may ask the daemon through this program. The daemon
/// decides what this plugin may do; this is what the client has a use for.
const READS: &[&str] = &[
    "status",
    "lanes",
    "lane_status",
    "lane_diff",
    "board",
    "comments",
    "review",
    "conflicts",
    "log",
    "why_graph",
    "reasons",
    "notes",
    // The text of a file: its content is asked by the ID the list gives.
    "lane_files",
    "get_blobs",
    // How an integration that was asked for ended.
    "integration_result",
    // What changed in a lane since the reader's own review.
    "changes_since_review",
    // The tasks, the search, the numbers, what agents are told.
    "tasks",
    "task",
    "search",
    "stats",
    "instructions",
    "instructions_text",
    "instructions_history",
    // What was: the checkpoints, what one changed, the files as they were.
    "checkpoints",
    "checkpoint_info",
    "diff",
    "tree",
];
const WRITES: &[&str] = &[
    "comment",
    "resolve_comment",
    "verdict",
    "submit_review",
    "apply_suggestion",
    "add_note",
    "remove_note",
    "open_lane",
    "close_lane",
    "request_integration",
    "resolve_conflict",
    "task_add",
    "task_update",
    "task_comment",
    "task_done",
    "task_reopen",
    "task_drop",
    "instructions_set",
    "instructions_remove",
];

/// What the client's pages ask only behind a server, where this program
/// passes nothing on: the server's own pages (its people, a repository's
/// rules, the kitchens' files), and the events, which have an address of
/// their own here.
#[cfg(test)]
const ONLY_BEHIND_A_SERVER: &[&str] = &["configure", "protect", "put_file", "events"];

#[derive(Clone)]
struct App {
    daemon: Daemon,
    /// What the browser must hold to be answered: given once, in the
    /// address this program prints.
    token: Arc<str>,
    /// The name of the cookie it is kept in: one per port, so that two
    /// repositories open at once do not take each other's.
    cookie: Arc<str>,
    /// The names this server answers to.
    hosts: Arc<[String]>,
}

impl App {
    /// `true` if the request comes from the browser that was given the address.
    fn knows(&self, headers: &HeaderMap) -> bool {
        let cookies = headers
            .get_all(header::COOKIE)
            .iter()
            .filter_map(|value| value.to_str().ok());
        let wanted = format!("{}={}", self.cookie, self.token);
        cookies
            .flat_map(|line| line.split(';'))
            .any(|cookie| same(cookie.trim().as_bytes(), wanted.as_bytes()))
    }
}

/// Compared whole, whatever differs: the time taken says nothing.
pub(crate) fn same(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |diff, (x, y)| diff | (x ^ y)) == 0
}

pub(crate) fn refused(status: StatusCode, message: &str) -> Response {
    (status, Json(json!({ "error": message }))).into_response()
}

/// Every request: only for this machine's own names (a page elsewhere
/// that points a name of its own at 127.0.0.1 is not one of them), and
/// with headers that keep the answers where they belong.
async fn guard(State(app): State<App>, request: Request, next: Next) -> Response {
    let host = request
        .headers()
        .get(header::HOST)
        .and_then(|host| host.to_str().ok())
        .unwrap_or_default();
    if !app.hosts.iter().any(|known| known == host) {
        return refused(
            StatusCode::FORBIDDEN,
            "kito-web answers on this machine only",
        );
    }
    sealed(next.run(request).await)
}

/// Headers that keep the answers where they belong.
pub(crate) fn sealed(mut response: Response) -> Response {
    let headers = response.headers_mut();
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    headers.insert(header::X_FRAME_OPTIONS, HeaderValue::from_static("DENY"));
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static(
            "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'",
        ),
    );
    response
}

#[derive(Deserialize)]
struct Opened {
    t: Option<String>,
}

/// The pages. The address this program printed carries the token once:
/// it becomes a cookie, and the address is left without it.
async fn page(State(app): State<App>, uri: Uri, Query(opened): Query<Opened>) -> Response {
    if let Some(given) = opened.t {
        if !same(given.as_bytes(), app.token.as_bytes()) {
            return refused(
                StatusCode::FORBIDDEN,
                "this address is not the one `kito web` printed",
            );
        }
        let cookie = format!(
            "{}={}; Path=/; HttpOnly; SameSite=Strict",
            app.cookie, app.token
        );
        let headers = [
            (header::SET_COOKIE, cookie),
            (header::LOCATION, "/".to_owned()),
        ];
        return (StatusCode::SEE_OTHER, headers).into_response();
    }
    client_file(uri.path().trim_start_matches('/'))
}

/// A file of the web client; what is no file of it is one of its pages.
pub(crate) fn client_file(path: &str) -> Response {
    let (name, file) = match Client::get(path) {
        Some(file) if !path.is_empty() => (path, file),
        _ => match Client::get("index.html") {
            Some(file) => ("index.html", file),
            None => {
                return refused(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "the web client is not in this program",
                )
            }
        },
    };
    let kind = mime_guess::from_path(name).first_or_octet_stream();
    // Built files carry a hash in their names; the page that names them does not.
    let cache = if name == "index.html" {
        "no-store"
    } else {
        "public, max-age=31536000, immutable"
    };
    (
        [
            (header::CONTENT_TYPE, kind.as_ref().to_owned()),
            (header::CACHE_CONTROL, cache.to_owned()),
        ],
        file.data,
    )
        .into_response()
}

/// A failure of the daemon, as the client is told it.
fn failed(failure: daemon::Failure) -> Response {
    let status = match failure.code {
        0 => StatusCode::BAD_GATEWAY,
        // Refused: it is not done, and asking again will not help.
        -32020 => StatusCode::FORBIDDEN,
        -32022 => StatusCode::NOT_FOUND,
        _ => StatusCode::BAD_REQUEST,
    };
    (
        status,
        Json(json!({ "error": failure.message, "code": failure.code })),
    )
        .into_response()
}

pub(crate) fn answered(value: Value) -> Response {
    ([(header::CACHE_CONTROL, "no-store")], Json(value)).into_response()
}

#[derive(Deserialize)]
struct Call {
    method: String,
    #[serde(default)]
    params: Value,
}

/// One question for the daemon.
async fn call(State(app): State<App>, headers: HeaderMap, Json(asked): Json<Call>) -> Response {
    if !app.knows(&headers) {
        return refused(
            StatusCode::UNAUTHORIZED,
            "open the address `kito web` printed",
        );
    }
    // A page of another site cannot set this: it marks the client's own requests.
    if headers.get("x-kito-web").is_none() {
        return refused(StatusCode::FORBIDDEN, "not a request of the web client");
    }
    let method = asked.method.as_str();
    if !READS.contains(&method) && !WRITES.contains(&method) {
        return refused(
            StatusCode::FORBIDDEN,
            &format!("`{method}` is not something the web client asks"),
        );
    }
    match app
        .daemon
        .ask(method, asked.params, Duration::from_secs(60))
        .await
    {
        Ok(value) => answered(value),
        Err(failure) => failed(failure),
    }
}

#[derive(Deserialize)]
struct After {
    after: Option<u64>,
}

/// What happened in the repository since event `after`: the answer waits
/// for something to tell, so that the client asks again at once.
async fn events(
    State(app): State<App>,
    headers: HeaderMap,
    Query(asked): Query<After>,
) -> Response {
    if !app.knows(&headers) {
        return refused(
            StatusCode::UNAUTHORIZED,
            "open the address `kito web` printed",
        );
    }
    let params = json!({ "after": asked.after, "wait_ms": 20_000 });
    match app
        .daemon
        .ask("events", params, Duration::from_secs(30))
        .await
    {
        Ok(value) => answered(value),
        Err(failure) => failed(failure),
    }
}

/// What this is, and whether the browser is known.
async fn info(State(app): State<App>, headers: HeaderMap) -> Response {
    let known = app.knows(&headers);
    let name = std::path::Path::new(&app.daemon.repo)
        .file_name()
        .map(|name| name.to_string_lossy().into_owned());
    let mut said =
        json!({ "known": known, "version": env!("CARGO_PKG_VERSION"), "api": daemon::API });
    if known {
        said["repository"] = json!(name);
        said["path"] = json!(app.daemon.repo);
        if let Ok(pong) = app
            .daemon
            .ask("ping", json!({}), Duration::from_secs(5))
            .await
        {
            said["kito"] = pong["version"].clone();
        }
    }
    answered(said)
}

fn usage() -> ExitCode {
    eprintln!("usage: kito web [--port N]   (0: any free port; default {PORT})");
    ExitCode::from(2)
}

#[tokio::main]
async fn main() -> ExitCode {
    // Run by a Kito server, for a team.
    if std::env::args().nth(1).as_deref() == Some("serve-pages") {
        return team::serve().await;
    }
    let mut port = PORT;
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--port" => match args.next().and_then(|port| port.parse().ok()) {
                Some(asked) => port = asked,
                None => return usage(),
            },
            "--version" => {
                println!("kito-web {}", env!("CARGO_PKG_VERSION"));
                return ExitCode::SUCCESS;
            }
            _ => return usage(),
        }
    }
    let daemon = match Daemon::from_env() {
        Ok(daemon) => daemon,
        Err(why) => {
            eprintln!("kito-web: {why}");
            return ExitCode::FAILURE;
        }
    };
    // The daemon is there, and lets this plugin read: said now, not at the first click.
    if let Err(failure) = daemon
        .ask("status", json!({}), Duration::from_secs(10))
        .await
    {
        eprintln!("kito-web: {}", failure.message);
        return ExitCode::FAILURE;
    }
    let mut bytes = [0u8; 32];
    if let Err(e) = getrandom::getrandom(&mut bytes) {
        eprintln!("kito-web: no randomness to make the address from: {e}");
        return ExitCode::FAILURE;
    }
    let token: String = bytes.iter().map(|byte| format!("{byte:02x}")).collect();

    // This machine only: nobody else on the network reaches it.
    let listener = match tokio::net::TcpListener::bind(("127.0.0.1", port)).await {
        Ok(listener) => listener,
        Err(e) => {
            eprintln!("kito-web: port {port} on this machine: {e} (`kito web --port 0` takes any free one)");
            return ExitCode::FAILURE;
        }
    };
    let port = listener.local_addr().map_or(port, |address| address.port());
    let app = App {
        daemon,
        token: token.as_str().into(),
        cookie: format!("kito_web_{port}").into(),
        hosts: vec![format!("127.0.0.1:{port}"), format!("localhost:{port}")].into(),
    };
    let router = Router::new()
        .route("/api/call", post(call))
        .route("/api/events", get(events))
        .route("/api/info", get(info))
        .fallback(get(page))
        .layer(middleware::from_fn_with_state(app.clone(), guard))
        .with_state(app.clone());

    println!(
        "kito-web: {} is at http://127.0.0.1:{port}/?t={token}",
        app.daemon.repo
    );
    println!("kito-web: for this machine only, until this is stopped (Ctrl-C)");
    let stopped = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    match axum::serve(listener, router)
        .with_graceful_shutdown(stopped)
        .await
    {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("kito-web: {e}");
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The requests the client's own files make: the name that `ask(` or
    /// `askIn(` is given, first or after the repository.
    fn asked_by_the_pages() -> Vec<(String, String)> {
        let source = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("frontend/src");
        let mut asked = Vec::new();
        for entry in std::fs::read_dir(&source).unwrap() {
            let path = entry.unwrap().path();
            let name = path.file_name().unwrap().to_string_lossy().into_owned();
            if !name.ends_with(".svelte") && !name.ends_with(".js") {
                continue;
            }
            let text = std::fs::read_to_string(&path).unwrap();
            for call in ["ask(", "askIn("] {
                for (at, _) in text.match_indices(call) {
                    // Not the end of another name (`task(`), and not where `ask` is defined.
                    let before = text[..at].chars().next_back();
                    if before.is_some_and(|c| c.is_alphanumeric() || c == '_') {
                        continue;
                    }
                    // What is asked is a name in quotes, given first, or
                    // second after the repository: a name worked out
                    // elsewhere is not one this can read.
                    let rest: String = text[at + call.len()..]
                        .trim_start()
                        .chars()
                        .take(200)
                        .collect();
                    let Some(open) = rest.find('\'') else {
                        continue;
                    };
                    let Some(len) = rest[open + 1..].find('\'') else {
                        continue;
                    };
                    let lead = rest[..open].trim();
                    let first_or_after_the_repository = lead.is_empty()
                        || lead.strip_suffix(',').is_some_and(|repository| {
                            !repository.is_empty()
                                && repository
                                    .chars()
                                    .all(|c| c.is_alphanumeric() || "_.$".contains(c))
                        });
                    let method = &rest[open + 1..open + 1 + len];
                    let is_a_name = !method.is_empty()
                        && method
                            .chars()
                            .all(|c| c.is_ascii_lowercase() || c == '_' || c == '.');
                    if is_a_name && first_or_after_the_repository {
                        asked.push((method.to_owned(), name.clone()));
                    }
                }
            }
        }
        asked
    }

    #[test]
    fn what_the_pages_ask_is_passed_on_here_or_asked_only_behind_a_server() {
        let asked = asked_by_the_pages();
        // The search found the pages' requests at all.
        for known in ["lanes", "lane_diff", "tasks", "comment"] {
            assert!(
                asked.iter().any(|(method, _)| method == known),
                "`{known}` was not found in the pages"
            );
        }
        for (method, file) in &asked {
            let here = READS.contains(&method.as_str()) || WRITES.contains(&method.as_str());
            let elsewhere =
                method.starts_with("server.") || ONLY_BEHIND_A_SERVER.contains(&method.as_str());
            assert!(
                here || elsewhere,
                "{file} asks `{method}`, which `kito web` passes on to nobody: on one's own machine \
                 that page fails. Add it to READS or WRITES, or to ONLY_BEHIND_A_SERVER"
            );
            assert!(
                !(here && elsewhere),
                "`{method}` is passed on and said to be asked only behind a server"
            );
        }
        // And nothing is passed on twice.
        for method in READS {
            assert!(!WRITES.contains(method), "`{method}` is in both lists");
        }
    }
}
