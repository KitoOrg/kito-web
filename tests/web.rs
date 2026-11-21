//! `kito web`, run as Kito runs it: installed as a plugin, enabled in a
//! repository, asked over HTTP as a browser would.
//!
//! These tests need Kito itself: `kito` and `kitod`, in `KITO_BIN` or in
//! `../kito/target/debug` (`cargo build -p kito-cli -p kitod` there).

use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};

fn kito_bin() -> PathBuf {
    let dir = std::env::var_os("KITO_BIN")
        .map(PathBuf::from)
        .unwrap_or_else(|| Path::new(env!("CARGO_MANIFEST_DIR")).join("../kito/target/debug"));
    let kito = dir.join(format!("kito{}", std::env::consts::EXE_SUFFIX));
    assert!(
        kito.is_file(),
        "{} is not there: these tests run kito-web under Kito. Build it (`cargo build -p kito-cli -p kitod` in \
         the kito repository) or set KITO_BIN to where `kito` and `kitod` are",
        kito.display()
    );
    dir
}

/// A repository with a lane that changed something, the plugin installed
/// and enabled in it, and `kito web` serving it.
struct Served {
    _tmp: tempfile::TempDir,
    root: PathBuf,
    config: PathBuf,
    child: Option<Child>,
    port: u16,
    token: String,
}

impl Served {
    fn kito(&self, args: &[&str]) -> Command {
        let bin = kito_bin();
        let mut command = Command::new(bin.join(format!("kito{}", std::env::consts::EXE_SUFFIX)));
        command
            .current_dir(&self.root)
            .args(args)
            .env(
                "KITOD_BIN",
                bin.join(format!("kitod{}", std::env::consts::EXE_SUFFIX)),
            )
            .env("KITO_AUTHOR", "ada")
            .env("KITO_NO_CLAUDE", "1")
            .env("KITO_CONFIG_DIR", &self.config)
            .env_remove("KITO_EMAIL");
        command
    }

    fn ok(&self, args: &[&str]) -> String {
        let out = self.kito(args).output().unwrap();
        let (said, errors) = (
            String::from_utf8_lossy(&out.stdout),
            String::from_utf8_lossy(&out.stderr),
        );
        assert!(out.status.success(), "kito {args:?}: {said}{errors}");
        said.into_owned()
    }

    fn start(permissions: Option<&str>) -> Served {
        let tmp = tempfile::tempdir().unwrap();
        let base = tmp.path().canonicalize().unwrap();
        let (root, config) = (base.join("shop"), base.join("config"));
        std::fs::create_dir_all(root.join("src")).unwrap();
        let mut served = Served {
            _tmp: tmp,
            root,
            config,
            child: None,
            port: 0,
            token: String::new(),
        };
        served.ok(&["init"]);
        std::fs::write(served.root.join(".gitignore"), ".kito/\n").unwrap();
        std::fs::write(served.root.join("src/shop.ts"), "export const price = 1;\n").unwrap();
        served.ok(&["checkpoint", "-m", "first version"]);
        served.ok(&[
            "lane",
            "open",
            "alice",
            "--intent",
            "a cheaper price",
            "--scope",
            "./",
        ]);
        std::fs::write(
            served.root.join(".kito/lanes/1/work/src/shop.ts"),
            "export const price = 0.5;\n",
        )
        .unwrap();

        // The plugin as it is installed from: the program and its manifest.
        let plugin = base.join("plugin");
        std::fs::create_dir_all(&plugin).unwrap();
        let program = Path::new(env!("CARGO_BIN_EXE_kito-web"));
        std::fs::copy(program, plugin.join(program.file_name().unwrap())).unwrap();
        let manifest = Path::new(env!("CARGO_MANIFEST_DIR")).join("kito-plugin.toml");
        std::fs::copy(manifest, plugin.join("kito-plugin.toml")).unwrap();
        served.ok(&["plugin", "add", "--path", plugin.to_str().unwrap()]);
        match permissions {
            Some(only) => served.ok(&["plugin", "enable", "web", "--only", only]),
            None => served.ok(&["plugin", "enable", "web"]),
        };

        let mut child = served
            .kito(&["web", "--port", "0"])
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        let mut line = String::new();
        BufReader::new(child.stdout.take().unwrap())
            .read_line(&mut line)
            .unwrap();
        served.child = Some(child);
        // kito-web: <repository> is at http://127.0.0.1:<port>/?t=<token>
        let address = line
            .trim()
            .rsplit("http://127.0.0.1:")
            .next()
            .unwrap_or_else(|| panic!("{line:?}"));
        let (port, token) = address
            .split_once("/?t=")
            .unwrap_or_else(|| panic!("{line:?}"));
        served.port = port.parse().unwrap();
        served.token = token.to_owned();
        served
    }

    /// One request, as a browser would send it; the status, the headers
    /// and the body of the answer.
    fn request(
        &self,
        method: &str,
        path: &str,
        headers: &[(&str, &str)],
        body: Option<&Value>,
    ) -> Answer {
        let mut stream = TcpStream::connect(("127.0.0.1", self.port)).unwrap();
        let body = body.map(Value::to_string).unwrap_or_default();
        let mut text = format!("{method} {path} HTTP/1.1\r\nConnection: close\r\n");
        if !headers
            .iter()
            .any(|(name, _)| name.eq_ignore_ascii_case("host"))
        {
            text.push_str(&format!("Host: 127.0.0.1:{}\r\n", self.port));
        }
        for (name, value) in headers {
            text.push_str(&format!("{name}: {value}\r\n"));
        }
        if !body.is_empty() {
            text.push_str(&format!(
                "Content-Type: application/json\r\nContent-Length: {}\r\n",
                body.len()
            ));
        }
        text.push_str("\r\n");
        stream.write_all(text.as_bytes()).unwrap();
        stream.write_all(body.as_bytes()).unwrap();
        let mut answer = Vec::new();
        stream.read_to_end(&mut answer).unwrap();
        let answer = String::from_utf8_lossy(&answer).into_owned();
        let (head, body) = answer.split_once("\r\n\r\n").unwrap_or((&answer, ""));
        let status = head
            .split(' ')
            .nth(1)
            .and_then(|code| code.parse().ok())
            .unwrap_or(0);
        Answer {
            status,
            head: head.to_lowercase(),
            body: body.to_owned(),
        }
    }

    fn cookie(&self) -> String {
        format!("kito_web_{}={}", self.port, self.token)
    }

    /// A question of the web client, from the browser that was let in.
    fn call(&self, method: &str, params: Value) -> Answer {
        let cookie = self.cookie();
        let headers = [("Cookie", cookie.as_str()), ("X-Kito-Web", "1")];
        self.request(
            "POST",
            "/api/call",
            &headers,
            Some(&json!({ "method": method, "params": params })),
        )
    }
}

impl Drop for Served {
    fn drop(&mut self) {
        if let Some(mut child) = self.child.take() {
            // On Unix `kito web` is the plugin itself. On Windows `kito`
            // started it and waits: both are stopped.
            #[cfg(windows)]
            let _ = Command::new("taskkill")
                .args(["/T", "/F", "/PID", &child.id().to_string()])
                .output();
            let _ = child.kill();
            let _ = child.wait();
        }
        let _ = self.kito(&["daemon", "stop"]).output();
    }
}

struct Answer {
    status: u16,
    head: String,
    body: String,
}

impl Answer {
    fn json(&self) -> Value {
        serde_json::from_str(&self.body).unwrap_or_else(|e| panic!("{e}: {}", self.body))
    }
}

#[test]
fn the_address_lets_one_browser_in_and_nobody_else() {
    let served = Served::start(None);

    // The client itself is for anybody on this machine: it holds nothing.
    let page = served.request("GET", "/", &[], None);
    assert_eq!(page.status, 200);
    assert!(page.body.contains("<div id=\"app\">"), "{}", page.body);
    assert!(
        page.head
            .contains("content-security-policy: default-src 'self'"),
        "{}",
        page.head
    );
    assert!(page.head.contains("x-frame-options: deny"), "{}", page.head);
    // A page of the client that is no file is the client.
    assert!(served
        .request("GET", "/lane/1", &[], None)
        .body
        .contains("<div id=\"app\">"));

    // What is in the repository is not: without the address, nothing.
    let unknown = served.request("GET", "/api/info", &[], None).json();
    assert_eq!(
        (unknown["known"].as_bool(), unknown.get("repository")),
        (Some(false), None)
    );
    let closed = served.request(
        "POST",
        "/api/call",
        &[("X-Kito-Web", "1")],
        Some(&json!({ "method": "lanes" })),
    );
    assert_eq!(closed.status, 401, "{}", closed.body);
    assert_eq!(served.request("GET", "/api/events", &[], None).status, 401);
    let guessed = [("Cookie", "kito_web_1=0000"), ("X-Kito-Web", "1")];
    assert_eq!(
        served
            .request(
                "POST",
                "/api/call",
                &guessed,
                Some(&json!({ "method": "lanes" }))
            )
            .status,
        401
    );
    assert_eq!(
        served.request("GET", "/?t=not-the-token", &[], None).status,
        403
    );

    // The address `kito web` printed lets the browser in, once: it leaves
    // with a cookie and an address that no longer carries the token.
    let opened = served.request("GET", &format!("/?t={}", served.token), &[], None);
    assert_eq!(opened.status, 303, "{}", opened.head);
    assert!(
        opened.head.contains("location: /\r\n") || opened.head.ends_with("location: /"),
        "{}",
        opened.head
    );
    let cookie = format!(
        "set-cookie: {}; path=/; httponly; samesite=strict",
        served.cookie()
    );
    assert!(opened.head.contains(&cookie), "{}", opened.head);

    let cookie = served.cookie();
    let known = served
        .request("GET", "/api/info", &[("Cookie", &cookie)], None)
        .json();
    assert_eq!(
        (known["known"].as_bool(), known["repository"].as_str()),
        (Some(true), Some("shop"))
    );
    assert!(known["kito"].is_string(), "{known}");

    // A name that is not this machine's is not answered, whoever it
    // points at; nor a request that is not the client's own.
    let elsewhere = [
        ("Host", "kito.example:80"),
        ("Cookie", cookie.as_str()),
        ("X-Kito-Web", "1"),
    ];
    assert_eq!(
        served
            .request(
                "POST",
                "/api/call",
                &elsewhere,
                Some(&json!({ "method": "lanes" }))
            )
            .status,
        403
    );
    assert_eq!(
        served
            .request("GET", "/", &[("Host", "kito.example")], None)
            .status,
        403
    );
    let foreign = served.request(
        "POST",
        "/api/call",
        &[("Cookie", &cookie)],
        Some(&json!({ "method": "lanes" })),
    );
    assert_eq!(foreign.status, 403, "{}", foreign.body);
    let named = [
        ("Host", &*format!("localhost:{}", served.port)),
        ("Cookie", cookie.as_str()),
    ];
    assert_eq!(served.request("GET", "/api/info", &named, None).status, 200);
}

#[test]
fn the_client_reads_and_writes_what_the_plugin_was_given() {
    let served = Served::start(None);

    let lanes = served.call("lanes", json!({}));
    assert_eq!(lanes.status, 200, "{}", lanes.body);
    assert_eq!(lanes.json()[0]["id"], "lane/1");
    let diff = served.call("lane_diff", json!({ "lane": "1" })).json();
    assert_eq!(
        (
            diff["files"][0]["path"].as_str(),
            diff["files"][0]["added"].as_u64()
        ),
        (Some("src/shop.ts"), Some(1))
    );

    // A comment on a line and a verdict, as the buttons send them: the
    // repository has them, for whoever asks any other way.
    let said = served.call(
        "comment",
        json!({ "lane": "1", "on": "src/shop.ts:1", "text": "Half as much?" }),
    );
    assert_eq!(said.status, 200, "{}", said.body);
    assert_eq!(said.json()["id"], "comment#1");
    let asked = served.call(
        "verdict",
        json!({ "lane": "1", "verdict": "request_changes", "text": "Say why." }),
    );
    assert_eq!(asked.json()["missing"], "changes requested by ada");
    let told = served.ok(&["lane", "comments", "1"]);
    assert!(
        told.contains("comment#1 on src/shop.ts:1 (ada): Half as much?"),
        "{told}"
    );
    assert!(served
        .ok(&["lane", "review", "1"])
        .contains("changes requested by ada: Say why."));
    assert_eq!(
        served
            .call("resolve_comment", json!({ "comment": "comment#1" }))
            .json()["resolved_by"],
        "ada"
    );

    // What happened since is told to a client that waits for it.
    let cookie = served.cookie();
    let now = served
        .request("GET", "/api/events", &[("Cookie", &cookie)], None)
        .json();
    let before = now["next"].as_u64().unwrap();
    served.ok(&["lane", "comment", "1", "Said from the command line."]);
    let since = served
        .request(
            "GET",
            &format!("/api/events?after={before}"),
            &[("Cookie", &cookie)],
            None,
        )
        .json();
    assert_eq!(since["events"][0]["kind"], "commented", "{since}");

    // Why code is the way it is, its text, and work found by its words.
    let why = served
        .call("why_graph", json!({ "target": "src/shop.ts", "lane": "1" }))
        .json();
    assert_eq!(why["target"]["kind"], "file", "{why}");
    assert_eq!(why["reasons"][0]["why"], "a cheaper price", "{why}");
    let listed = served
        .call(
            "lane_files",
            json!({ "lane": "1", "paths": ["src/shop.ts"] }),
        )
        .json();
    let blob = listed["files"][0]["blob"].as_str().unwrap().to_owned();
    let content = served.call("get_blobs", json!({ "blobs": [blob] })).json();
    // The lane's line about the price, in base64.
    assert_eq!(
        content["blobs"][&blob],
        "ZXhwb3J0IGNvbnN0IHByaWNlID0gMC41Owo="
    );
    let found = served.call("reasons", json!({ "about": "cheaper" })).json();
    assert_eq!(found[0]["lane"], "lane/1", "{found}");
    let log = served.call("log", json!({ "limit": 5 })).json();
    assert!(log.as_array().is_some_and(|log| !log.is_empty()), "{log}");

    // A note, left and removed.
    let note = served
        .call(
            "add_note",
            json!({ "on": "src/shop.ts", "text": "Read by the till." }),
        )
        .json();
    assert_eq!(note["id"], "note#1", "{note}");
    assert!(served.ok(&["note", "--list"]).contains("Read by the till."));
    assert_eq!(
        served
            .call("notes", json!({}))
            .json()
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        served
            .call("remove_note", json!({ "note": "note#1" }))
            .status,
        200
    );
    assert_eq!(served.call("notes", json!({})).json(), json!([]));

    // What the daemon refuses is said as it said it; what does not exist, too.
    let none = served.call("lane_diff", json!({ "lane": "9" }));
    assert_eq!(none.status, 404, "{}", none.body);
    let empty = served.call("comment", json!({ "lane": "1", "text": "?" }));
    assert_eq!(empty.status, 400, "{}", empty.body);
    assert!(empty.json()["error"]
        .as_str()
        .unwrap()
        .contains("needs a few words"));

    // The client asks for what it has a use for, and nothing else: not
    // what the plugin was not given, and not what it was.
    for method in [
        "configure",
        "plugin_key",
        "shutdown",
        "put_file",
        "rollback",
        "ping",
    ] {
        let refused = served.call(method, json!({ "lane": "1" }));
        assert_eq!(refused.status, 403, "{method}: {}", refused.body);
        assert!(
            refused
                .body
                .contains("is not something the web client asks"),
            "{method}: {}",
            refused.body
        );
    }
    assert!(served
        .ok(&["status"])
        .contains("Plugin ............ web 0.7.0 (read, write, integrate)"));
}

#[test]
fn lanes_are_opened_integrated_and_closed_from_the_browser() {
    let served = Served::start(None);

    // Asked to integrate, the lane goes in; the answer waits for how it ended.
    let asked = served
        .call("request_integration", json!({ "lane": "1" }))
        .json();
    let job = asked["job"]
        .as_str()
        .unwrap_or_else(|| panic!("{asked}"))
        .to_owned();
    let ended = served
        .call(
            "integration_result",
            json!({ "job": job, "wait_ms": 20000 }),
        )
        .json();
    assert_eq!(ended["state"], "done", "{ended}");
    assert_eq!(ended["result"]["result"], "integrated", "{ended}");
    let main = std::fs::read_to_string(served.root.join("src/shop.ts")).unwrap();
    assert_eq!(main, "export const price = 0.5;\n");

    // A lane is opened for an agent, with why and what; and closed.
    let opened = served.call(
        "open_lane",
        json!({ "agent": "bob", "intent": "a price for two", "scope": ["src/shop.ts"] }),
    );
    assert_eq!(opened.status, 200, "{}", opened.body);
    let lane = opened.json();
    assert_eq!(lane["id"], "lane/2", "{lane}");
    assert!(
        std::path::Path::new(lane["workdir"].as_str().unwrap()).is_dir(),
        "{lane}"
    );
    // An intent that says nothing is refused as Kito refuses it.
    let vague = served.call(
        "open_lane",
        json!({ "agent": "bob", "intent": "fix", "scope": ["./"] }),
    );
    assert_eq!(vague.status, 400, "{}", vague.body);
    assert_eq!(
        served.call("close_lane", json!({ "lane": "2" })).status,
        200
    );
    let open: Vec<String> = served
        .call("lanes", json!({}))
        .json()
        .as_array()
        .unwrap()
        .iter()
        .map(|lane| lane["id"].to_string())
        .collect();
    assert_eq!(open, ["\"lane/1\""]);
}

#[test]
fn a_repository_may_leave_integrating_to_the_command_line() {
    let served = Served::start(Some("read,write"));
    assert_eq!(
        served
            .call("comment", json!({ "lane": "1", "text": "Half as much?" }))
            .status,
        200
    );
    let refused = served.call("request_integration", json!({ "lane": "1" }));
    assert_eq!(refused.status, 403, "{}", refused.body);
    assert!(
        refused.body.contains("it needs the permission `integrate`"),
        "{}",
        refused.body
    );
    assert!(served.ok(&["integrate", "1"]).contains("integrated"));
}

#[test]
fn a_repository_that_lets_it_read_only_is_read_only_in_the_browser() {
    let served = Served::start(Some("read"));
    assert_eq!(served.call("lanes", json!({})).status, 200);
    let refused = served.call("comment", json!({ "lane": "1", "text": "Half as much?" }));
    assert_eq!(refused.status, 403, "{}", refused.body);
    let why = refused.json()["error"].as_str().unwrap().to_owned();
    assert!(
        why.contains("the plugin `web` may not ask `comment`: it needs the permission `write`"),
        "{why}"
    );
    assert!(served
        .ok(&["lane", "comments", "1"])
        .contains("No comment waits"));
    let note = served.call(
        "add_note",
        json!({ "on": "src/shop.ts", "text": "Read by the till." }),
    );
    assert_eq!(note.status, 403, "{}", note.body);
    assert_eq!(
        served
            .call("why_graph", json!({ "target": "src/shop.ts" }))
            .status,
        200
    );
}

#[test]
fn outside_kito_it_says_how_it_is_run() {
    let out = Command::new(env!("CARGO_BIN_EXE_kito-web"))
        .env_remove("KITO_REPO")
        .env_remove("KITO_SOCKET")
        .env_remove("KITO_PLUGIN_KEY")
        .output()
        .unwrap();
    assert!(!out.status.success());
    let said = String::from_utf8_lossy(&out.stderr);
    assert!(
        said.contains("kito plugin enable web") && said.contains("`kito web`"),
        "{said}"
    );
}
