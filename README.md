# kito-web

Kito in a browser: a plugin of [Kito](https://github.com/KitoOrg/kito)
that serves a web client for a repository.

Kito has no interface of its own. This is one, and it is not part of
Kito: it asks the repository's daemon what `kito` asks, through the
daemon's API (version 1, `docs/api.md` in Kito), within the permissions
the repository gives it. Nothing of Kito is linked into it.

## What it does (0.4)

- **The lanes** of a repository, and where each stands.
- **A lane**: what it is for, what it changes (files, functions and
  lines), what was said about it.
- **Comments**: on a line of the diff, or on the lane as a whole;
  answers; resolving. The agent working in the lane is told before its
  next edit, as with `kito lane comment`.
- **Review**: where it stands, approve, request changes, withdraw.
  Approving brings nothing in: integrating does.
- **Integrating**: a lane is asked to go in, and the page says how it
  ended: integrated, checks that failed (with what they printed),
  changes outside its scope, a wait (for its review, or a gate), or
  conflicts.
- **Conflicts**: what the lane and its target both did, side by side;
  keep one, or write the text. The next integration applies it.
- **Opening and closing** a lane: for whom, why, and what it will change.
- **Why**: for a function, a file or what a lane changed, the reasons it
  is the way it is, which of its lines each reason wrote, who uses it,
  which lanes are on it now, and the notes left on it. Earlier work is
  found by the words of its reason.
- **The log** of the main lane: each checkpoint and the changes it holds.
- **Notes**: every note on the repository's code; leaving one, removing
  one.
- It follows the repository as it changes: no reloading.
- **For a team**, behind a Kito server: the same client at the server's
  own address, for whoever signs in there, about the repositories they
  may use.

Not yet: extending a lane's scope, renaming a function, permanent lanes'
catch-up.

## Using it

```bash
scripts/build.sh                    # the client, then the program: plugin/
kito plugin add --path plugin       # installed for you
cd your-repository
kito plugin enable web              # this repository lets it read, write and integrate
kito web                            # prints the address to open
```

`kito web` serves on this machine only (`127.0.0.1`, port 7423; `--port
N`, or `--port 0` for any free one) until it is stopped. The address it
prints carries a token, once: the browser that opens it is let in, and
nobody else on the machine is. What is done in the browser is done by
whoever runs the repository.

`kito plugin enable web --only read,write` leaves integrating to `kito
integrate`; `--only read` makes it a viewer. The daemon refuses the rest,
and the client says so.

`scripts/demo.sh` makes a repository to look at (lanes that went in, a
note, a lane with comments, a request for changes and a conflict waiting
for it) and serves it.

## Behind a server, for a team

A Kito server that enables the plugin serves the client itself, at its
HTTP address:

```bash
kito-server plugin add --path plugin
kito-server plugin enable web
kito-server serve --http 0.0.0.0:7443     # https://<the server>:7443/
```

- Whoever opens the address **signs in**: in one of the ways the
  server's plugins offer (`kito-github`, `kito-oidc`), or with the token
  the server gave them.
- They see **the repositories they may use**, and choose one
  (`?repo=shop`). What they may do there is what the server says: one
  who may only read is shown as much, and refused the rest.
- The client asks **the server itself** about a repository
  (`/-/api/<repository>`), as the person. This program only hands out
  the client's files: the server never gives it a session or a token,
  and it answers to its server alone.
- `kito-server plugin enable web --only read,pages` makes it a viewer
  for everybody.

`scripts/demo-team.sh` makes a server to look at, with two people and
two repositories, and serves it on this machine.

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
