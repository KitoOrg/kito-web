# The one way to do each thing

Every page of the client is made of the same few things and says a thing
the same way. Where a page does something another way, the page changes,
not the rule. What a program can check of this is checked before every
build (`npm run lint`, `scripts/lint-ui.mjs`); the rest is here.

Where it all lives, in `src/`:

- `app.css`: the sizes of text, the colours, the controls, the surfaces.
- `format.js`: how values are written (times, sizes, counts, names).
- `standing.js`: how states are worded, and their tone.
- `PageHead`, `Confirm`, `Err`, `Empty`, `Loading`, `NoAccess`, `Time`,
  `State`, `Icon`, `SettingCard`, `Editor`, `Face`, `Assistant`: one
  component each for what every page needs.

## Principles

- Nothing is said twice on a page: no chip, heading or sentence that
  repeats what is right next to it; no state or action shown in two
  places.
- A component's `<style>` holds only the layout that is its own (a
  grid's columns, a width). Never a size of text, a colour, a radius, a
  padding or a height that `app.css` defines. A shared class is used as
  it is: what is unique gets a class of its own.
- No copies: what two components need lives in `format.js`,
  `standing.js` or `app.css`.

## Type

- Sizes: 12 (`.small`, hints, table heads, chips, mono), 13 (everything
  else), 14 (what is read at length: `.rendered`, `.said`), 15 (section
  titles), 20 (the title of a page). 11 only for `.count` and the marks
  of faces and assistants.
- Weights: 400 text, 500 controls, labels and names in rows, 600 titles.
- Headings by what they head: `h1` the page (only in `PageHead`),
  `h2.section-title` a section (a `p.section-lead` under it when it needs
  a line), `h3` a card, a panel or a column, `h4` a group inside one.
- Mono (`.mono`, `code`) is for what could be typed: lanes, tasks,
  checkpoints, paths, functions, commands, addresses. Names of people and
  repositories are plain.

## Layout

- One container (`.wrap`) for the top bar, the tabs and the page: their
  left edges are the same.
- Pages use the whole container. Text is at most 760 wide (`.lead`,
  `.section-lead`), forms and settings 720 (`.narrow`). No other widths.
- Two columns: `.cols` (the page and a 300px side column), `.cols.left`
  (a 240px list and what it lists). They stack under 900px.
- `.stack` puts things under one another, 12px apart. A card is
  `.panel.pad`; a list in a panel is `.rows` of `.row`; a strip at the top
  or the foot of a panel is `.panel-head`, `.panel-foot`.
- Breakpoints: 640 (phone), 900 (columns stack), 760 for the top bar
  alone. Nothing makes a page wider than a 375px screen: what is wide
  scrolls in its own box (`.table-wrap`, `pre`).

## The head of a page

`<PageHead title="Tasks" lead="…">`, with `after` (a chip beside the
title) and `actions` (buttons on the right). It names the browser's tab.

- The title is the words of the tab or the menu entry that leads there.
  The scope ("in shop", "every repository") goes in the lead.
- A page about one thing takes the thing as its title and says the way
  back (`back={{ href, label }}`): a lane, a function, a kitchen.

## Buttons

- `.primary`: the one main action of a region (a page's head, a form,
  the review bar), first in its row. Default: the others. `.quiet`:
  Cancel, and what is done to a row. `.danger`: what cannot be undone or
  takes access away, last in its row after `<span class="grow">`. `.sm`:
  in rows, panel heads and feet. A link that looks like a button is
  `a.button` with the same words.
- Save is primary, says "Save", and is disabled until something changed.
- A button that waits says so with an ellipsis ("Saving…"); an ellipsis
  is for nothing else.
- Verbs: Remove (taken out, can be added again), Delete (erased for
  good), Archive, Restore, Disable, Enable, Unlink, Drop (a task),
  Withdraw (a verdict), Close the lane. What one wrote is sent with
  Comment, Answer or Add. A filter or a search is run with Search. A form
  is opened by its own verb ("Add a person") and sent by it in short
  ("Add"); it is left with Cancel.
- A panel is put away with an icon button (`aria-label="Close"`).
- No `confirm()`, `prompt()` or `alert()`.

## Before what cannot be undone

`<Confirm label="Remove" ask="Remove carol from this server? Her token
and sessions stop working." onyes={…} sm />`: the question uses the
button's verb and says what follows, in one sentence. `typed="shop"`
asks for the name to be typed.

## What the page says back

- After every action that worked: `toast('carol removed')`, a few words
  on what is now true.
- What did not work: `<Err message={…} />`, right under what was pressed.
  Only a page that could not load says it at the top.
- What has to stay (a token to copy, a path): a `.result` panel with an
  icon Close. Never a toast as well.

## Nothing, waiting, not for you

- `<Loading />` while something is asked for; `<Empty title="No lanes
  yet">a line on why, or what to do</Empty>` where there is nothing
  (title: a few words, no full stop). In a table: one row with one cell.
  A value that is not there: `<span class="none">None</span>`.
- A page for others is `<NoAccess>`, shown by `App.svelte`.

## Chips, and what is not one

- A `.chip` is where a thing stands, in at most three lower-case words.
  Tones: `ok` (went well, ready, on), `warn` (waits for somebody), `bad`
  (stopped until somebody acts), `done` (over), `accent` (under way, the
  current one), none (a plain fact).
- A state that is worked out is worded by `standing.js` and shown with
  `<State lane={…} />`, `<State task={…} />` or `<State said={…} />`: one
  wording and one tone everywhere, and filters and columns named by the
  same words. A chip written by hand is fixed text (`enabled`).
- In a row of a list the tone is a `.ring` at its start and the words
  plain text at its side (`<State … plain />`): never a ring and a chip
  of the same thing.
- Not a chip: a kind or a source (`.tag`), a count (`.count`), a link, a
  sentence, a second fact about a row (`.tag`), a title said again
  (nothing).
- A lane is written `lane/3`, a task `task#1`, a checkpoint `ckpt#3`, as
  `.ref`, and is a link wherever it has a page. Who for whom is
  `who(by, forWhom)`. A quoted reason is `<q class="reason">`.

## Values

- A time is `<Time ms={…} />`: how long ago, the moment itself to
  whoever points at it. A day that matters as a day is `day(ms)`.
- `size(bytes)`, `count(n, 'lane')`, `span(ms)`, `spans(7, 30, 90)` for
  the choices of a time span, `humanize(text)` for what the server wrote
  with raw byte counts.

## Forms

- A field is `<label class="field"><span>Name</span><input><span
  class="hint">…</span></label>`: its name above, help under. Several
  side by side: `.fields`. A placeholder is one example of a value.
- A filter bar (`form.panel.filters`) has no visible labels: every
  control has an `aria-label`. What is chosen applies at once; what is
  typed, on Enter or Search.
- A setting that is chosen saves at once; one that is typed has Save.
- A new thing is added in a form opened from the head of the page
  (`form.panel.pad.narrow.form`: an `h3`, the fields, `[Add] [Cancel]`),
  or under a `.sm` "New" button at the foot of a side list.

## Words

- "admin". "integrate" and "integrated". A lane's "scope". A repository
  "uses" a kitchen. "Linked to" a repository at GitHub. The repository's
  "check commands"; a lane's "Checks".
- The typographic apostrophe in what is shown. Sentence case for titles,
  labels, buttons and choices; chips lower-case.
- A page that is named is a link to it.

## Pictures, and whoever does not see the page

- `<Icon name="…" />`: no glyphs standing for pictures, no emoji. A
  button with only a picture has an `aria-label`.
- No `title` attributes: what matters is on the page; why a button is
  disabled is a `.hint` beside it.
- A part of a page that opens is a `<details>`. A checkbox is for a
  filter or a setting.
- Whoever may only read is shown nothing the server would refuse
  (`mayWrite(role)`, `mayIntegrate(role)` in `api.js`).
