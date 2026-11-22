# kito-web

Kito in a browser: a plugin of [Kito](https://github.com/KitoOrg/kito)
that serves a web client for a repository.

Kito has no interface of its own. This is one, and it is not part of
Kito: it asks the repository's daemon what `kito` asks, through the
daemon's API (version 1, `docs/api.md` in Kito), within the permissions
the repository gives it. Nothing of Kito is linked into it.

## What it does (0.17)

- **The lanes** of a repository, as a list: where each stands, whose it
  is, what it declared, which other lanes are on the same code. The
  list narrows to those that wait for a review, were asked to change,
  have conflicts to decide, are yours, or are closed.
- **Which assistant** the agent of a lane runs in, and on what model
  when it is known: a mark of two letters on the lane (`CC` Claude Code,
  `Cx` Codex, `Zc` ZCode; any other by its own first letters), with the
  name, the version and the model beside it or on hover. It is what Kito
  0.25 keeps of what the assistant said of itself; with an older Kito,
  or a lane nobody said anything of, nothing is shown. The marks are
  letters, not the vendors' logos.
- **A lane**, read the way a change is reviewed, in four parts:
  the **conversation** (the lane opened, the comments and their
  answers, the verdicts, in the order they came, then a box to approve,
  ask for changes or comment); the **changes** (files, functions and
  lines, with what was said on them); the **checks** (whether it merges,
  whether it stayed in what it declared, where its review stands, what
  the repository runs before it goes in); and **why** (for each
  function it touched: the reasons before this one, who else is on it
  now, the notes left on it). Beside them: integrating, the review, what
  it declared, the lanes on the same code, and its agent. A lane that is
  closed says so, and where to find what it brought in.
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
- **The code, with its reasons**: the files on one side, a file in the
  middle with a stripe beside each line for the reason it was last
  written for, and beside it what that reason was: point at a line to
  read why it is there, at a reason to see the lines it wrote. As the
  main lane has it, or as a lane does.
- **Why**: for a function, a file or what a lane changed, the reasons it
  is the way it is, which of its lines each reason wrote, who uses it,
  which lanes are on it now, and the notes left on it. Earlier work is
  found by the words of its reason.
- **The log** of the main lane: each checkpoint and the changes it holds.
- **Notes**: every note on the repository's code; leaving one, removing
  one.
- **Kitchens**, behind a server that runs the kitchen plugin
  ([kito-kitchen](https://github.com/KitoOrg/kito-kitchen)), under the
  Server menu: the kitchens of the server (a repository with a
  `kitchen.toml`, or one another repository is attached to) and which
  repositories use each. A kitchen is read part by part: its behaviour,
  concepts, recipes, tools, instructions and parts, Markdown rendered,
  each file with the changes made to it. Who may write in it changes a
  file, or writes a new concept or recipe, in the browser: a lane is
  opened for it, and integrated when they may integrate (else it waits
  there for somebody who may). Maintainers attach their repositories to
  it from the kitchen's side, and an admin starts a new kitchen: a
  repository with the files `kito-server kitchen new` writes. A
  repository's Settings link to its kitchen.
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
- They land on **what needs them**, across the repositories they may
  use: conflicts to decide, lanes of theirs that were asked to change,
  lanes that wait for their review, or for somebody who may integrate
  when they may. Beside it: the repositories with what is open in
  each, who is at work, and the lanes that are on the same code. It is
  read from what each repository says of its lanes: nothing is kept.
- A repository is chosen from there (`?repo=shop`). What they may do
  in it is what the server says: one who may only read is shown as
  much, and refused the rest.
- The client asks **the server itself** about a repository
  (`/-/api/<repository>`), as the person. This program only hands out
  the client's files: the server never gives it a session or a token,
  and it answers to its server alone.
- `kito-server plugin enable web --only read,pages` makes it a viewer
  for everybody.
- **People**, for a repository's maintainers and the server's admins
  (Kito 0.30): who uses the repository and as what, when each was last
  here, the lanes each has open; changing a role, taking the repository
  away, giving it to somebody on the server. For admins, a page of
  everybody on the server, their role there and the repositories each
  was given, and adding somebody new: with a token, shown once with the
  `kito connect` line to pass on, or by who they are for a way to sign in
  that the server offers. Admins and owners are named by owners. A
  change counts at once, in the connections that are open.
- **Search** (Kito 0.34), from a box in the top bar: reasons and what
  they changed, lanes, tasks, comments and notes, by words, kind, time,
  who (a person, an agent, an assistant or a model), where and outcome;
  in one repository, or in every one the person may use.
- **Insights** (Kito 0.34): lanes week by week, how long they take, each
  assistant and model (integrated, conflicts, refused or held edits,
  failed checks), the busiest files and functions, review. Charts drawn
  with Chart.js (MIT, in `licenses/`).
- **Tasks** (Kito 0.33): what needs doing, as a board by where each
  stands (to do, in a lane, ready to close, done); a task with its text,
  its lanes, whom it is for and what was said on it, which the agents in
  its lanes are told. Whoever may write asks for tasks, comments, says
  whom they are for, and closes them: dropping a card on "Done" closes
  it, dragging it back reopens it. A lane's page links to its task, and
  "Needs you" has the tasks asked of you and those you asked for that are
  ready to close.
- **Instructions** (Kito 0.32): what the assistants are told, each file
  with where it comes from (the kitchen, the repository, or the
  repository over the kitchen), and what Claude Code, Codex or ZCode
  reads, Kito's rules first. Whoever may write edits the repository's
  own, with a rendered preview; overrides a kitchen file, or stops it
  being told; and puts back an earlier text from the list of changes.
  The kitchen's own files are changed in the kitchen, through a lane:
  the page links there.
- **Settings**, for a repository's maintainers and the server's admins
  (Kito 0.31): protection, approvals, the git remote, the kitchen; the
  checks, which run commands on the server's machine, for its admins
  only. Under each, who changed it last and to what. The plugin asks
  for `admin` for this page: enabled without it, the page says so.
- **Audit** and **Backups**, for the server's admins (Kito 0.35): what
  changed the server and who did it, or each request, with whether the
  log's chain is whole; the backups here and in S3, one made now, one
  downloaded.
- **Review in the diff** (Kito 0.38): comments on lines wait as a
  draft and go out with the verdict in one review; a comment may suggest
  the lines to put in place, applied with one click or by the agent;
  files are marked viewed until they change again; "since my review"
  shows only what changed after your verdict; a bar at the bottom keeps
  the review, the approvals, what stands in the way and Integrate at hand.
- **Repositories**, for the server's admins (Kito 0.36): every one with
  who has it and its size; add one, empty or from a git address (a
  token used once); rename and archive; owners bring an archived one
  back or delete it now.
- **The server's plugins**, for its admins (`kito-server user role
  <name> admin`, on the server's machine): what is installed and what
  each was given, what the registry lists, and install, enable, disable
  and remove. A plugin is installed by its name from the server's
  registry and nothing else; what it is given is ticked before it is
  enabled; the plugin that serves these pages is not taken out from
  them. The server decides and does all of it (`/-/admin/plugins`, Kito
  0.23): this page only asks.

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

## How it looks

Kito's mark is three lanes that come in and become one. The colours are
indigo on a cool paper, light and dark; green, amber, red and slate say
where a lane stands, and are not the brand's. The typeface is
[Geist](https://vercel.com/font) and Geist Mono (Vercel, SIL Open Font
License 1.1, in `licenses/`), and Chart.js (MIT, in `licenses/`), carried with the client: a browser that
opens it asks nothing of anybody else.

## License

MIT or Apache-2.0, at your option, as Kito.
