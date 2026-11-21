//! Behind a Kito server, for a team (ADR 0006 of Kito).
//!
//! `kito-web serve-pages` is how a server that enabled this plugin runs
//! it: it serves the same web client, to the server only, which passes
//! on what browsers ask at its own address. Here the client asks the
//! server itself about a repository (`/-/api/<repository>`), as the
//! person who is signed in: this program is never given their session,
//! and answers nothing about any repository.

use axum::extract::{Request, State};
use axum::http::{header, HeaderMap, StatusCode, Uri};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use serde_json::json;
use std::process::ExitCode;
use std::sync::Arc;

/// Where the server tells this program to listen, and what it says with
/// every request it passes on.
const ENV_LISTEN: &str = "KITO_PAGES_LISTEN";
const ENV_SECRET: &str = "KITO_PAGES_SECRET";

fn said<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .filter(|value| !value.is_empty())
}

/// Every request comes from the server, or is refused: what the server
/// says of who asks is believed, so nobody else may say it.
async fn guard(State(secret): State<Arc<str>>, request: Request, next: Next) -> Response {
    let given = said(request.headers(), "x-kito-secret").unwrap_or_default();
    if !crate::same(given.as_bytes(), secret.as_bytes()) {
        return crate::refused(
            StatusCode::FORBIDDEN,
            "kito-web serves these pages to its Kito server only",
        );
    }
    crate::sealed(next.run(request).await)
}

async fn answer(headers: HeaderMap, uri: Uri) -> Response {
    // The pages may be under a path of the server (`/web`).
    let mount = said(&headers, "x-kito-mount")
        .unwrap_or("/")
        .trim_end_matches('/');
    let path = uri.path();
    if !mount.is_empty() && path == mount {
        // With the `/`: the client names its files from where it is.
        return (
            StatusCode::PERMANENT_REDIRECT,
            [(header::LOCATION, format!("{mount}/"))],
        )
            .into_response();
    }
    let rest = path
        .strip_prefix(mount)
        .unwrap_or(path)
        .trim_start_matches('/');
    if rest == "api/info" {
        let user = said(&headers, "x-kito-user");
        return crate::answered(json!({
            "team": true,
            "user": user,
            "version": env!("CARGO_PKG_VERSION"),
            "api": crate::daemon::API,
        }));
    }
    if rest.starts_with("api/") {
        return crate::refused(
            StatusCode::NOT_FOUND,
            "behind a server, the client asks the server itself: /-/api/<repository>",
        );
    }
    crate::client_file(rest)
}

pub async fn serve() -> ExitCode {
    let (Ok(listen), Ok(secret)) = (std::env::var(ENV_LISTEN), std::env::var(ENV_SECRET)) else {
        eprintln!(
            "kito-web: `serve-pages` is how a Kito server runs this plugin: `kito-server plugin enable web`, then \
             `kito-server serve --http <address>`"
        );
        return ExitCode::FAILURE;
    };
    if secret.len() < 32 {
        eprintln!("kito-web: what the server says with its requests is too short to be a secret");
        return ExitCode::FAILURE;
    }
    let listener = match tokio::net::TcpListener::bind(&listen).await {
        Ok(listener) => listener,
        Err(e) => {
            eprintln!("kito-web: {listen}: {e}");
            return ExitCode::FAILURE;
        }
    };
    // The server holds the standard input open: when it closes, the
    // server is gone, and so is this.
    std::thread::spawn(|| {
        let mut gone = Vec::new();
        let _ = std::io::Read::read_to_end(&mut std::io::stdin(), &mut gone);
        std::process::exit(0);
    });
    let secret: Arc<str> = secret.into();
    let router = Router::new()
        .fallback(get(answer))
        .layer(middleware::from_fn_with_state(secret.clone(), guard))
        .with_state(secret);
    match axum::serve(listener, router).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("kito-web: {e}");
            ExitCode::FAILURE
        }
    }
}
