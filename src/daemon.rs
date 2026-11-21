//! The daemon of the repository, asked as its API says (Kito's
//! `docs/api.md`, version 1): JSON-RPC, one message a line, on the socket
//! Kito named, after a first line that says this plugin's key.
//!
//! Nothing of Kito is linked in: what this file knows is what a program
//! outside Kito is told.

use serde_json::{json, Value};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};

/// The version of the daemon's API this was written for.
pub const API: u64 = 1;

/// Where the daemon is and what to say to it: from the environment Kito
/// starts a plugin with.
#[derive(Clone, Debug)]
pub struct Daemon {
    pub repo: String,
    socket: String,
    key: String,
}

/// What the daemon said no to, or what went wrong on the way.
#[derive(Debug)]
pub struct Failure {
    /// The daemon's code (`-32020`: refused); 0 when it never answered.
    pub code: i64,
    pub message: String,
}

impl Failure {
    fn unreachable(why: impl std::fmt::Display) -> Failure {
        Failure {
            code: 0,
            message: format!("the daemon of this repository did not answer: {why}"),
        }
    }
}

trait Wire: AsyncRead + AsyncWrite + Unpin + Send {}
impl<T: AsyncRead + AsyncWrite + Unpin + Send> Wire for T {}

impl Daemon {
    /// From `KITO_REPO`, `KITO_SOCKET`, `KITO_PLUGIN_KEY` and `KITO_API`.
    pub fn from_env() -> Result<Daemon, String> {
        let said = |name: &str| std::env::var(name).ok().filter(|value| !value.is_empty());
        let how = "kito-web is a plugin of Kito: install it with `kito plugin add --path <dir>`, enable it in a \
                   repository with `kito plugin enable web`, and run it there as `kito web`";
        let (Some(repo), Some(socket), Some(key)) = (
            said("KITO_REPO"),
            said("KITO_SOCKET"),
            said("KITO_PLUGIN_KEY"),
        ) else {
            return Err(how.to_owned());
        };
        match said("KITO_API").and_then(|api| api.parse::<u64>().ok()) {
            Some(api) if api >= API => Ok(Daemon { repo, socket, key }),
            Some(api) => Err(format!(
                "this Kito speaks API {api}, and kito-web needs API {API}: update Kito"
            )),
            None => Err(how.to_owned()),
        }
    }

    async fn connect(&self) -> std::io::Result<Box<dyn Wire>> {
        #[cfg(unix)]
        {
            Ok(Box::new(
                tokio::net::UnixStream::connect(&self.socket).await?,
            ))
        }
        #[cfg(windows)]
        {
            Ok(Box::new(
                tokio::net::windows::named_pipe::ClientOptions::new().open(&self.socket)?,
            ))
        }
    }

    /// Asks one thing, on a connection of its own, and waits up to `wait`
    /// for the answer.
    pub async fn ask(&self, method: &str, params: Value, wait: Duration) -> Result<Value, Failure> {
        let asking = async {
            let stream = self.connect().await.map_err(Failure::unreachable)?;
            let (reader, mut writer) = tokio::io::split(stream);
            let request = json!({ "jsonrpc": "2.0", "id": 1, "method": method, "params": params });
            let lines = format!("{}\n{request}\n", json!({ "key": self.key }));
            writer
                .write_all(lines.as_bytes())
                .await
                .map_err(Failure::unreachable)?;
            let mut answer = String::new();
            BufReader::new(reader)
                .read_line(&mut answer)
                .await
                .map_err(Failure::unreachable)?;
            if answer.trim().is_empty() {
                return Err(Failure::unreachable("it closed the connection"));
            }
            let answer: Value = serde_json::from_str(&answer).map_err(Failure::unreachable)?;
            match answer.get("error") {
                Some(error) => Err(Failure {
                    code: error["code"].as_i64().unwrap_or(0),
                    message: error["message"]
                        .as_str()
                        .unwrap_or("the daemon refused")
                        .to_owned(),
                }),
                None => Ok(answer.get("result").cloned().unwrap_or(Value::Null)),
            }
        };
        match tokio::time::timeout(wait, asking).await {
            Ok(answered) => answered,
            Err(_) => Err(Failure::unreachable(format!(
                "no answer in {} s",
                wait.as_secs()
            ))),
        }
    }
}
