//! `kito-web serve-pages`: the web client behind a Kito server, for a team.
//!
//! The first test runs the program alone, as a server would. The second
//! runs it under a Kito server, and needs `kito-server` and `kitod` in
//! `KITO_BIN` or in `../kito/target/debug` (`cargo build -p kitod -p
//! kito-server` there).

use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

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

fn request(
    address: &str,
    method: &str,
    path: &str,
    headers: &[(&str, &str)],
    body: Option<&Value>,
) -> Answer {
    let mut stream = TcpStream::connect(address).unwrap();
    let body = body.map(Value::to_string).unwrap_or_default();
    let mut text = format!("{method} {path} HTTP/1.1\r\nHost: {address}\r\nConnection: close\r\n");
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

/// Asks until something listens there: a program takes a moment to start.
fn when_up(address: &str, path: &str, headers: &[(&str, &str)]) -> Answer {
    let started = Instant::now();
    loop {
        if TcpStream::connect(address).is_ok() {
            let answer = request(address, "GET", path, headers, None);
            if answer.status != 502 {
                return answer;
            }
        }
        assert!(
            started.elapsed() < Duration::from_secs(20),
            "nothing answers at {address}"
        );
        std::thread::sleep(Duration::from_millis(50));
    }
}

/// The file the page names as its program.
fn script_of(page: &str) -> &str {
    let from = page.find("./assets/").unwrap_or_else(|| panic!("{page}"));
    let name = &page[from + 2..];
    &name[..name.find('"').unwrap()]
}

#[test]
fn it_serves_the_client_to_its_server_and_to_nobody_else() {
    let port = TcpListener::bind("127.0.0.1:0")
        .unwrap()
        .local_addr()
        .unwrap()
        .port();
    let address = format!("127.0.0.1:{port}");
    let secret = "s".repeat(64);
    let mut child = Command::new(env!("CARGO_BIN_EXE_kito-web"))
        .arg("serve-pages")
        .env("KITO_PAGES_LISTEN", &address)
        .env("KITO_PAGES_SECRET", &secret)
        .stdin(Stdio::piped())
        .spawn()
        .unwrap();
    let from_server = [("X-Kito-Secret", secret.as_str()), ("X-Kito-Mount", "/")];

    // The page, and its files named from where it is.
    let page = when_up(&address, "/", &from_server);
    assert_eq!(page.status, 200, "{}", page.body);
    assert!(
        page.head.contains("cache-control: no-store")
            && page.head.contains("x-frame-options: deny")
    );
    let script = request(
        &address,
        "GET",
        &format!("/{}", script_of(&page.body)),
        &from_server,
        None,
    );
    assert_eq!(script.status, 200);
    assert!(
        script.head.contains("javascript") && script.head.contains("immutable"),
        "{}",
        script.head
    );

    // Without what the server says with its requests: nothing, whoever
    // the request says it is for.
    for headers in [
        &[][..],
        &[("X-Kito-Secret", "guess"), ("X-Kito-User", "ada")][..],
    ] {
        let refused = request(&address, "GET", "/api/info", headers, None);
        assert_eq!(refused.status, 403, "{}", refused.body);
    }

    // It says it is behind a server, and who the server says is asking.
    let nobody = request(&address, "GET", "/api/info", &from_server, None).json();
    assert_eq!(
        (nobody["team"].as_bool(), nobody["user"].is_null()),
        (Some(true), true),
        "{nobody}"
    );
    let known = [
        ("X-Kito-Secret", secret.as_str()),
        ("X-Kito-Mount", "/"),
        ("X-Kito-User", "ada"),
    ];
    assert_eq!(
        request(&address, "GET", "/api/info", &known, None).json()["user"],
        "ada"
    );
    // Nothing of a repository is asked of this program there.
    assert_eq!(
        request(
            &address,
            "POST",
            "/api/call",
            &known,
            Some(&json!({ "method": "lanes" }))
        )
        .status,
        405
    );
    assert_eq!(
        request(&address, "GET", "/api/events", &known, None).status,
        404
    );

    // Under a path of the server.
    let under = [("X-Kito-Secret", secret.as_str()), ("X-Kito-Mount", "/web")];
    let moved = request(&address, "GET", "/web", &under, None);
    assert!(
        moved.status == 308 && moved.head.contains("location: /web/"),
        "{}",
        moved.head
    );
    assert_eq!(
        request(&address, "GET", "/web/", &under, None).body,
        page.body
    );
    assert_eq!(
        request(&address, "GET", "/web/api/info", &under, None).json()["team"],
        true
    );

    // The server gone, it goes.
    drop(child.stdin.take());
    let started = Instant::now();
    while child.try_wait().unwrap().is_none() {
        assert!(
            started.elapsed() < Duration::from_secs(10),
            "still running after its server left"
        );
        std::thread::sleep(Duration::from_millis(50));
    }
}

#[test]
fn outside_a_server_it_says_how_it_is_run() {
    let out = Command::new(env!("CARGO_BIN_EXE_kito-web"))
        .arg("serve-pages")
        .env_remove("KITO_PAGES_LISTEN")
        .env_remove("KITO_PAGES_SECRET")
        .output()
        .unwrap();
    assert!(!out.status.success());
    assert!(String::from_utf8_lossy(&out.stderr).contains("kito-server plugin enable web"));
}

fn kito_bin() -> PathBuf {
    let dir = std::env::var_os("KITO_BIN")
        .map(PathBuf::from)
        .unwrap_or_else(|| Path::new(env!("CARGO_MANIFEST_DIR")).join("../kito/target/debug"));
    let server = dir.join(format!("kito-server{}", std::env::consts::EXE_SUFFIX));
    assert!(
        server.is_file(),
        "{} is not there: this test runs kito-web under a Kito server. Build it (`cargo build -p kitod -p \
         kito-server` in the kito repository) or set KITO_BIN to where `kito-server` and `kitod` are",
        server.display()
    );
    dir
}

#[test]
fn a_kito_server_serves_it_to_whoever_signs_in() {
    let bin = kito_bin();
    let exe = |name: &str| bin.join(format!("{name}{}", std::env::consts::EXE_SUFFIX));
    let tmp = tempfile::tempdir().unwrap();
    let base = tmp.path().canonicalize().unwrap();
    let (dir, config) = (base.join("server"), base.join("config"));
    let server = |args: &[&str]| {
        let mut command = Command::new(exe("kito-server"));
        command
            .arg("--dir")
            .arg(&dir)
            .args(args)
            .env("KITOD_BIN", exe("kitod"))
            .env("KITO_AUTHOR", "the server")
            .env("KITO_CONFIG_DIR", &config);
        command
    };
    let ok = |args: &[&str]| {
        let out = server(args).output().unwrap();
        let (said, errors) = (
            String::from_utf8_lossy(&out.stdout),
            String::from_utf8_lossy(&out.stderr),
        );
        assert!(out.status.success(), "kito-server {args:?}: {said}{errors}");
        said.into_owned()
    };
    let token = |printed: String| {
        printed
            .lines()
            .find(|line| line.starts_with("kito_"))
            .unwrap()
            .trim()
            .to_owned()
    };

    // The plugin as it is installed from: the program and its manifest.
    let plugin = base.join("plugin");
    std::fs::create_dir_all(&plugin).unwrap();
    let program = Path::new(env!("CARGO_BIN_EXE_kito-web"));
    std::fs::copy(program, plugin.join(program.file_name().unwrap())).unwrap();
    std::fs::copy(
        Path::new(env!("CARGO_MANIFEST_DIR")).join("kito-plugin.toml"),
        plugin.join("kito-plugin.toml"),
    )
    .unwrap();

    ok(&["init", dir.to_str().unwrap()]);
    ok(&["repo", "add", "shop"]);
    ok(&["repo", "add", "books"]);
    // Something for a lane to start from.
    let shop = dir.join("repos/shop");
    std::fs::write(shop.join(".gitignore"), ".kito/\n").unwrap();
    std::fs::write(shop.join("shop.ts"), "export const price = 1;\n").unwrap();
    let first = Command::new(exe("kito"))
        .arg("--repo")
        .arg(&shop)
        .args(["checkpoint", "-m", "first version"])
        .env("KITOD_BIN", exe("kitod"))
        .env("KITO_NO_CLAUDE", "1")
        .env("KITO_AUTHOR", "the server")
        .env("KITO_CONFIG_DIR", &config)
        .output()
        .unwrap();
    assert!(
        first.status.success(),
        "{}",
        String::from_utf8_lossy(&first.stderr)
    );
    ok(&["plugin", "add", "--path", plugin.to_str().unwrap()]);
    let enabled = ok(&["plugin", "enable", "web"]);
    assert!(
        enabled.contains("It may: read, write, integrate, admin, pages.")
            && enabled.contains("pages under /"),
        "{enabled}"
    );
    let ada = token(ok(&[
        "user",
        "add",
        "ada",
        "--repo",
        "shop:integrate",
        "--repo",
        "books:integrate",
    ]));
    let carol = token(ok(&["user", "add", "carol", "--repo", "shop:read"]));

    struct Serving(std::process::Child, PathBuf, PathBuf);
    impl Drop for Serving {
        fn drop(&mut self) {
            let _ = self.0.kill();
            let _ = self.0.wait();
            for repo in ["shop", "books"] {
                let root = self.2.join("repos").join(repo);
                let _ = Command::new(&self.1)
                    .arg("--repo")
                    .arg(root)
                    .args(["daemon", "stop"])
                    .output();
            }
        }
    }
    let mut serving = Serving(
        server(&[
            "serve",
            "--plain",
            "--listen",
            "127.0.0.1:0",
            "--http",
            "127.0.0.1:0",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap(),
        exe("kito"),
        dir.clone(),
    );
    let mut line = String::new();
    BufReader::new(serving.0.stdout.take().unwrap())
        .read_line(&mut line)
        .unwrap();
    // kito-server: http://127.0.0.1:<port>, pages: web at /
    assert!(line.contains("pages: web at /"), "{line}");
    let http = line
        .trim()
        .strip_prefix("kito-server: http://")
        .and_then(|rest| rest.split(',').next())
        .unwrap()
        .to_owned();

    // The page is there for anybody: it is where they sign in. It says
    // nothing of any repository.
    let page = when_up(&http, "/", &[]);
    assert_eq!(page.status, 200, "{}", page.body);
    assert_eq!(
        request(
            &http,
            "GET",
            &format!("/{}", script_of(&page.body)),
            &[],
            None
        )
        .status,
        200
    );
    let nobody = request(&http, "GET", "/api/info", &[], None).json();
    assert_eq!(
        (nobody["team"].as_bool(), nobody["user"].is_null()),
        (Some(true), true),
        "{nobody}"
    );
    assert_eq!(request(&http, "GET", "/-/me", &[], None).status, 401);
    // What a browser says of who it is counts for nothing.
    let lied = request(&http, "GET", "/api/info", &[("X-Kito-User", "ada")], None).json();
    assert!(lied["user"].is_null(), "{lied}");

    // A session, as the client opens one with a token.
    let session = |token: &str| {
        let opened = request(
            &http,
            "POST",
            "/-/session",
            &[],
            Some(&json!({ "token": token })),
        );
        assert_eq!(opened.status, 200, "{}", opened.body);
        let value = opened
            .head
            .lines()
            .find_map(|line| line.strip_prefix("set-cookie: kito_session="))
            .unwrap();
        format!("kito_session={}", value.split(';').next().unwrap())
    };
    let (ada, carol) = (session(&ada), session(&carol));
    assert_eq!(
        request(&http, "GET", "/api/info", &[("Cookie", &ada)], None).json()["user"],
        "ada"
    );
    let me = request(&http, "GET", "/-/me", &[("Cookie", &carol)], None).json();
    assert_eq!(me["repos"], json!([{ "name": "shop", "role": "read" }]));

    // The people of the server and of a repository, as the pages ask:
    // for the server's admins, and for a repository's maintainers.
    let people = |cookie: &str, method: &str, params: Value| {
        let call = json!({ "method": method, "params": params });
        request(
            &http,
            "POST",
            "/-/people",
            &[("Cookie", cookie), ("X-Kito", "1")],
            Some(&call),
        )
    };
    let members = |cookie: &str| {
        let call = json!({ "method": "server.members", "params": {} });
        request(
            &http,
            "POST",
            "/-/api/shop",
            &[("Cookie", cookie), ("X-Kito", "1")],
            Some(&call),
        )
    };
    assert_eq!(people(&ada, "server.people", json!({})).status, 403);
    assert_eq!(members(&ada).status, 403);
    ok(&["user", "role", "ada", "admin"]);
    assert_eq!(
        people(&ada, "server.people", json!({}))
            .json()
            .as_array()
            .unwrap()
            .len(),
        2
    );
    let listed = members(&ada).json();
    assert!(
        listed["members"]
            .as_array()
            .unwrap()
            .iter()
            .any(|m| m["user"] == "carol" && m["role"] == "read" && m["seen_ms"].is_u64()),
        "{listed}"
    );
    let added = people(&ada, "server.people_add", json!({ "user": "dan" })).json();
    assert!(
        added["token"].as_str().unwrap().starts_with("kito_"),
        "{added}"
    );
    assert_eq!(people(&carol, "server.people", json!({})).status, 403);
    assert_eq!(members(&carol).status, 403);

    // What the assistants are told: written by one who may write, read by
    // one who may only read, with who changed it.
    let call = |cookie: &str, method: &str, params: Value| {
        let call = json!({ "method": method, "params": params });
        request(
            &http,
            "POST",
            "/-/api/shop",
            &[("Cookie", cookie), ("X-Kito", "1")],
            Some(&call),
        )
    };
    let set = call(
        &ada,
        "instructions_set",
        json!({ "name": "money", "text": "Whole cents." }),
    );
    assert_eq!(set.status, 200, "{}", set.body);
    let read = call(&carol, "instructions_text", json!({ "assistant": "codex" })).json();
    assert!(
        read["text"].as_str().unwrap().contains("Whole cents."),
        "{read}"
    );
    assert_eq!(
        call(&carol, "instructions_history", json!({})).json()[0]["by"],
        "ada"
    );
    assert_eq!(
        call(
            &carol,
            "instructions_set",
            json!({ "name": "x", "text": "no" })
        )
        .status,
        403
    );

    // Tasks: asked for by one who may write, seen by a reader, not changed by one.
    let task = call(
        &ada,
        "task_add",
        json!({ "title": "Prices in cents", "for": "carol" }),
    );
    assert_eq!(task.status, 200, "{}", task.body);
    let listed = call(&carol, "tasks", json!({})).json();
    assert_eq!(listed[0]["id"], "task#1", "{listed}");
    assert_eq!(listed[0]["for"], "carol");
    assert_eq!(
        call(&carol, "task_done", json!({ "task": "task#1" })).status,
        403
    );

    // Search and numbers, for whoever may read.
    let found = call(&carol, "search", json!({ "q": "cents" })).json();
    assert!(
        found
            .as_array()
            .unwrap()
            .iter()
            .any(|hit| hit["kind"] == "task"),
        "{found}"
    );
    let stats = call(&carol, "stats", json!({})).json();
    assert!(stats["flow"]["weeks"].is_array(), "{stats}");

    // The audit log, for admins: what changed the server, and each request.
    let audit = people(&ada, "server.audit", json!({})).json();
    assert!(
        audit
            .as_array()
            .unwrap()
            .iter()
            .any(|entry| entry["kind"] == "user_added"),
        "{audit}"
    );
    let asked = people(
        &ada,
        "server.audit",
        json!({ "requests": true, "who": "carol" }),
    )
    .json();
    assert!(
        asked
            .as_array()
            .unwrap()
            .iter()
            .any(|entry| entry["what"] == "stats"),
        "{asked}"
    );
    assert_eq!(
        people(&ada, "server.audit_verify", json!({})).json()["whole"],
        true
    );
    assert_eq!(people(&carol, "server.audit", json!({})).status, 403);

    // What the client asks of a repository, the server answers as the
    // person: everything this plugin was given for ada, reading for carol.
    let ask = |cookie: &str, repo: &str, method: &str, params: Value| {
        let call = json!({ "method": method, "params": params });
        request(
            &http,
            "POST",
            &format!("/-/api/{repo}"),
            &[("Cookie", cookie), ("X-Kito", "1")],
            Some(&call),
        )
    };
    assert_eq!(ask(&ada, "shop", "lanes", json!({})).json(), json!([]));
    let opened = ask(
        &ada,
        "shop",
        "open_lane",
        json!({ "agent": "alice", "intent": "a cheaper price", "scope": ["./"] }),
    );
    assert_eq!(opened.status, 200, "{}", opened.body);
    assert_eq!(opened.json()["owner"], "ada");
    assert_eq!(
        ask(&carol, "shop", "lanes", json!({})).json()[0]["id"],
        "lane/1"
    );
    let refused = ask(
        &carol,
        "shop",
        "comment",
        json!({ "lane": "1", "text": "why?" }),
    );
    assert_eq!(refused.status, 403, "{}", refused.body);
    assert_eq!(ask(&carol, "books", "lanes", json!({})).status, 404);
    // Every method the client has a use for is one the server lets a client ask.
    for method in ["status", "board", "log", "notes", "conflicts"] {
        let answer = ask(&ada, "shop", method, json!({}));
        assert_eq!(answer.status, 200, "{method}: {}", answer.body);
    }
    // What happens, as it happens: asked the same way.
    let events = ask(
        &ada,
        "shop",
        "events",
        json!({ "after": null, "wait_ms": 0 }),
    );
    assert!(
        events.status == 200 && events.json()["next"].is_number(),
        "{}",
        events.body
    );
}
