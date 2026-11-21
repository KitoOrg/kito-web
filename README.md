# kito-web

Kito in a browser: a plugin of [Kito](https://github.com/KitoOrg/kito)
that serves a web client for a repository.

Kito has no interface of its own. This is one, and it is not part of
Kito: it asks the repository's daemon what `kito` asks, through the
daemon's API (version 1, `docs/api.md` in Kito), within the permissions
the repository gives it. Nothing of Kito is linked into it.

## What it does (0.1)

- **The lanes** of a repository, and where each stands.
- **A lane**: what it is for, what it changes (files, functions and
  lines), what was said about it.
- **Comments**: on a line of the diff, or on the lane as a whole;
  answers; resolving. The agent working in the lane is told before its
  next edit, as with `kito lane comment`.
- **Review**: where it stands, approve, request changes, withdraw.
  Approving brings nothing in: `kito integrate` does.
- It follows the repository as it changes: no reloading.

Not yet: the why graph, the log and notes; opening, closing and
integrating lanes, and conflicts; a team signing in next to a
`kito-server`.

## Using it

```bash
scripts/build.sh                    # the client, then the program: plugin/
kito plugin add --path plugin       # installed for you
cd your-repository
kito plugin enable web              # this repository lets it read and write
kito web                            # prints the address to open
```

`kito web` serves on this machine only (`127.0.0.1`, port 7423; `--port
N`, or `--port 0` for any free one) until it is stopped. The address it
prints carries a token, once: the browser that opens it is let in, and
nobody else on the machine is. What is done in the browser is done by
whoever runs the repository.

`kito plugin enable web --only read` makes it read-only: the daemon then
refuses comments and verdicts, and the client says so.

`scripts/demo.sh` makes a repository with two lanes, comments and a
request for changes, and serves it.

## How it is made

- `src/`: one program (Rust, axum). It reads `KITO_REPO`, `KITO_SOCKET`,
  `KITO_PLUGIN_KEY` and `KITO_API` from the environment Kito starts a
  plugin with, and passes what the client asks on to the daemon: only the
  methods the client has a use for, only for the browser that holds the
  token, only for requests named for this machine.
- `frontend/`: the client (Svelte, built by Vite into `frontend/dist`),
  carried inside the program.
- `kito-plugin.toml`: what Kito is told about it.

```bash
cd frontend && npm run dev          # the client alone, asking a running `kito web`
cargo test                          # needs Kito built in ../kito, or KITO_BIN
```

The tests run `kito-web` under a real Kito: installed as a plugin,
enabled in a repository, asked over HTTP.

## License

MIT or Apache-2.0, at your option, as Kito.
