<script>
  // A lane, read the way a change is reviewed: what was said, what it
  // changes, what stands in its way, and why the code it touches is the
  // way it is. Beside them: where it stands, and who is at work.
  import { ago, ask, laneLink, watch } from './api.js';
  import { checksOf, stopping } from './checks.js';
  import { sameCode } from './standing.js';
  import Assistant from './Assistant.svelte';
  import Face from './Face.svelte';
  import FileDiff from './FileDiff.svelte';
  import Integrate from './Integrate.svelte';
  import LaneChecks from './LaneChecks.svelte';
  import LaneTalk from './LaneTalk.svelte';
  import LaneWhy from './LaneWhy.svelte';
  import State from './State.svelte';

  // `tab`: which part is read; `at`: the file to go to in the changes.
  // `user`, `role`: who is signed in behind a server, and what they may do.
  let { lane, tab = 'conversation', at = null, user = null, role = undefined } = $props();

  let info = $state(null);
  let diff = $state(null);
  let review = $state(null);
  let comments = $state([]);
  // The lane as the board has it: who else is on its code, when it last changed.
  let seen = $state(null);
  // What the repository runs on a merged result.
  let commands = $state([]);
  let resolved = $state(false);
  let failed = $state('');
  // A lane that is closed: what is still known of it.
  let closed = $state(null);

  async function load() {
    try {
      // The diff first: it records what was saved in the lane a moment ago.
      const changes = await ask('lane_diff', { lane });
      const [status, said, stands, board, repository] = await Promise.all([
        ask('lane_status', { lane }),
        ask('comments', { lane, all: resolved }),
        ask('review', { lane }),
        ask('board').catch(() => []),
        ask('status').catch(() => null),
      ]);
      [diff, info, comments, review, failed] = [changes, status, said, stands, ''];
      seen = board.find((one) => one.id === status.id) ?? null;
      commands = repository?.repo?.checks ?? [];
    } catch (error) {
      failed = error.message;
      if (info === null) await gone();
    }
  }

  // Not an open lane: perhaps one that was closed.
  async function gone() {
    try {
      const all = await ask('lanes', { all: true });
      const id = lane.startsWith('lane/') || isNaN(lane) ? lane : `lane/${lane}`;
      closed = all.find((one) => one.state === 'closed' && (one.id === id || one.name === lane)) ?? null;
    } catch {
      // What was said first stands.
    }
  }

  $effect(() => {
    resolved;
    load();
  });

  $effect(() => {
    // Told when something happens to this lane, or lands under it.
    let pending = null;
    const stop = watch((events) => {
      const id = info?.id;
      if (!events.some((event) => !event.lane || event.lane === id || event.kind === 'integrated')) return;
      clearTimeout(pending);
      pending = setTimeout(load, 150);
    });
    return () => {
      stop();
      clearTimeout(pending);
    };
  });

  // The file a comment is on, among those the lane changed.
  function fileOf(comment) {
    if (!comment.on) return null;
    const paths = diff?.files.map((file) => file.path) ?? [];
    if (paths.includes(comment.on)) return comment.on;
    const lines = comment.on.replace(/:\d+(-\d+)?$/, '');
    if (paths.includes(lines)) return lines;
    return paths.find((path) => comment.on.startsWith(`${path}:`)) ?? null;
  }

  // Each comment that started an exchange, with its answers and its file.
  let threads = $derived(
    comments
      .filter((comment) => !comment.reply_to)
      .map((comment) => ({
        comment,
        answers: comments.filter((answer) => answer.reply_to === comment.id),
        file: fileOf(comment),
      })),
  );
  const inFile = (path) => threads.filter((thread) => thread.file === path);

  // The conflicts no integration has applied a decision to yet.
  let conflicts = $derived((info?.conflicts ?? []).filter((conflict) => typeof conflict === 'object' && !conflict.resolved));

  let totals = $derived(
    (diff?.files ?? []).reduce((sum, file) => ({ added: sum.added + file.added, removed: sum.removed + file.removed }), {
      added: 0,
      removed: 0,
    }),
  );

  // What the lane changed, for its reasons: functions where the file has
  // them, the file itself where it has none.
  let targets = $derived(
    (diff?.files ?? []).flatMap((file) => {
      const symbols = (file.symbols ?? []).filter((symbol) => symbol.change !== 'removed');
      if (symbols.length > 0) return symbols.map((symbol) => ({ target: symbol.symbol, kind: 'function', change: symbol.change }));
      return file.change === 'removed' ? [] : [{ target: file.path, kind: 'file', change: file.change }];
    }),
  );

  let rows = $derived(info && diff && review ? checksOf({ info, diff, review, checks: commands, conflicts }) : []);
  let stops = $derived(stopping(rows));
  // The other lanes on the very same code, each said once: by the
  // function both are on rather than by one that calls it.
  let close = $derived.by(() => {
    const found = new Map();
    for (const one of seen?.overlaps ?? []) {
      if (!['function', 'caller'].includes(one.kind)) continue;
      if (!found.has(one.lane) || one.kind === 'function') found.set(one.lane, one);
    }
    return [...found.values()];
  });

  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const here = (name) => `${laneLink(lane)}${name === 'conversation' ? '' : `?tab=${name}`}`;
  let parts = $derived([
    ['conversation', 'Conversation', threads.length],
    ['changes', 'Changes', diff?.files.length ?? 0],
    ['checks', 'Checks', stops],
    ['why', 'Why', targets.length],
  ]);
  let part = $derived(parts.some(([name]) => name === tab) ? tab : 'conversation');

  $effect(() => {
    // From a comment to the file it is on.
    if (part !== 'changes' || !at || !diff) return;
    queueMicrotask(() => document.getElementById(`file-${at}`)?.scrollIntoView({ block: 'start' }));
  });

  const who = (verdict) => (verdict.for ? `${verdict.by}, of ${verdict.for}` : verdict.by);
</script>

{#if info === null && closed}
  <div class="head">
    <h1>{closed.task ?? closed.intent ?? 'no intent said'}</h1>
    <State lane={closed} />
  </div>
  <p class="sub soft">
    <span class="mono">{closed.id}</span>
    · {closed.agent}{#if closed.owner && closed.owner !== closed.agent}&nbsp;for {closed.owner}{/if}
    {#if closed.assistant?.name}· <Assistant assistant={closed.assistant} words />{/if}
  </p>
  <div class="panel gone">
    <p>This lane is closed: its working copy is gone, and nothing more is said in it.</p>
    <p class="soft">
      What it brought in is in <a href="#/log">the log</a> of the main lane, under its reason; why the code it touched is
      the way it is now is in <a href="#/why">code and why</a>.
    </p>
    {#if closed.scope?.length > 0}
      <p class="soft">Declared: <span class="mono">{closed.scope.join(', ')}</span></p>
    {/if}
  </div>
{:else if failed && info === null}
  <p class="error">{failed}</p>
{:else if info === null}
  <p class="soft">…</p>
{:else}
  <div class="head">
    <h1>{info.task?.startsWith('task#') ? (info.intent ?? info.task) : (info.task ?? info.intent ?? 'no intent said')}</h1>
    {#if info.task?.startsWith('task#')}<p class="faint">For <a href={`#/tasks?task=${encodeURIComponent(info.task)}`}>{info.task}</a></p>{/if}
    <State lane={info} />
  </div>
  <p class="sub soft">
    <span class="mono">{info.name ?? info.id}</span>
    · <b>{info.agent}</b>{#if info.owner && info.owner !== info.agent}&nbsp;for <b>{info.owner}</b>{/if}
    wants to bring {count(diff.files.length, 'file', 'files')} into <span class="mono">{diff.onto}</span>
    {#if diff.behind > 0}· {diff.behind} behind{/if}
  </p>

  <nav class="parts" aria-label="Parts of the lane">
    {#each parts as [name, label, n] (name)}
      <a href={here(name)} aria-current={part === name ? 'page' : undefined}>
        {label}{#if n > 0}<span class="count" class:bad={name === 'checks'}>{n}</span>{/if}
      </a>
    {/each}
  </nav>

  {#if failed}<p class="error">{failed}</p>{/if}

  <div class="columns">
    <div class="main">
      {#if part === 'conversation'}
        <LaneTalk
          {lane}
          {info}
          {seen}
          {threads}
          verdicts={review.verdicts}
          {conflicts}
          target={diff.onto}
          {role}
          {user}
          bind:resolved
          changed={load}
        />
      {:else if part === 'changes'}
        {#if diff.behind > 0}
          <p class="notice">
            {diff.onto} changed {count(diff.behind, 'file', 'files')} since this lane started: it has not seen
            {diff.behind === 1 ? 'it' : 'them'}.
          </p>
        {/if}
        {#if info.out_of_scope?.length > 0}
          <p class="notice">Changed outside what it declared: <span class="mono">{info.out_of_scope.join(', ')}</span></p>
        {/if}
        <p class="summary soft">
          {count(diff.files.length, 'file', 'files')} changed,
          <span class="plus">+{totals.added}</span> <span class="minus">−{totals.removed}</span>
          · from {diff.base}
        </p>
        {#if diff.files.length === 0}
          <div class="panel empty soft">This lane has changed nothing yet.</div>
        {/if}
        {#each diff.files as file (file.path)}
          <FileDiff {lane} {file} threads={inFile(file.path)} changed={load} />
        {/each}
      {:else if part === 'checks'}
        <LaneChecks {rows} />
      {:else}
        <LaneWhy {lane} id={info.id} {targets} />
      {/if}
    </div>

    <aside>
      {#if role !== 'read'}
        <Integrate {lane} {info} changed={load} />
      {/if}

      <section class="panel box" aria-label="Review">
        <h2>Review</h2>
        {#if review.missing}
          <p><span class="chip warn">{review.missing}</span></p>
        {:else if review.approved_by.length > 0}
          <p><span class="chip ok">approved by {review.approved_by.join(', ')}</span></p>
        {:else}
          <p class="soft small">No verdict yet{review.required === 0 ? ', and none is needed' : ''}.</p>
        {/if}
        {#if review.required > 0}
          <p class="soft small">
            {count(review.required, 'approval', 'approvals')} needed, from somebody other than the lane’s owner.
          </p>
        {/if}
        {#each review.verdicts as verdict}
          <p class="line small">
            <Face name={verdict.by} agent={Boolean(verdict.for)} />
            <span>{who(verdict)} <span class="soft">{verdict.verdict.replaceAll('_', ' ')}</span></span>
          </p>
        {/each}
      </section>

      <section class="panel box" aria-label="Checks">
        <h2>Checks</h2>
        {#each rows.filter((row) => row.tone && row.tone !== 'ok') as row (row.name)}
          <p class="small"><span class={`chip ${row.tone}`}>{row.name}</span> <span class="soft">{row.text}</span></p>
        {:else}
          <p class="soft small">Nothing stands in its way that can be seen before it asks to go in.</p>
        {/each}
        <p class="small"><a href={here('checks')}>All of them</a></p>
      </section>

      <section class="panel box" aria-label="Declared">
        <h2>Declared</h2>
        {#each info.scope ?? [] as item}
          <p class="mono item">{item}</p>
        {:else}
          <p class="soft small">Nothing.</p>
        {/each}
        {#if seen?.broad}
          <p class="soft small">Broad: it covers {count(seen.scope_files, 'file', 'files')}.</p>
        {/if}
      </section>

      {#if close.length > 0}
        <section class="panel box" aria-label="On the same code">
          <h2>On the same code</h2>
          {#each close as other}
            <p class="small">
              <a class="mono" href={laneLink(other.lane)}>{other.lane}</a>
              ({other.agent}{#if other.owner}&nbsp;for {other.owner}{/if}): <span class="soft">{other.detail}</span>
            </p>
          {/each}
        </section>
      {/if}

      <section class="panel box" aria-label="Agent">
        <h2>Agent</h2>
        <p class="line">
          <Face name={info.agent} agent assistant={info.assistant} />
          <span>
            <b>{info.agent}</b>{#if info.owner && info.owner !== info.agent}<span class="soft">&nbsp;for {info.owner}</span>{/if}
          </span>
        </p>
        {#if info.assistant?.name}
          <p class="small"><Assistant assistant={info.assistant} words /></p>
          {#if info.assistant.version}<p class="faint small">version {info.assistant.version}, as it said of itself</p>{/if}
        {:else}
          <p class="faint small">Nothing says which assistant it runs in.</p>
        {/if}
        {#if seen?.last_change_ms}<p class="faint small">Last change {ago(seen.last_change_ms)}</p>{/if}
      </section>
    </aside>
  </div>
{/if}

<style>
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  h1 {
    overflow-wrap: anywhere;
  }
  .sub {
    margin: 6px 0 14px;
    font-size: 14px;
  }
  .sub b {
    color: var(--ink);
    font-weight: 600;
  }
  .parts {
    display: flex;
    gap: 2px;
    margin-bottom: 16px;
    border-bottom: 1px solid var(--line);
    overflow-x: auto;
  }
  .parts a {
    padding: 8px 12px;
    color: var(--soft);
    font-size: 14px;
    white-space: nowrap;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
  }
  .parts a:hover {
    text-decoration: none;
    color: var(--ink);
  }
  .parts a[aria-current='page'] {
    color: var(--ink);
    font-weight: 600;
    border-color: var(--accent);
  }
  .count {
    margin-left: 6px;
    padding: 0 7px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--panel);
    font-size: 12px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .count.bad {
    background: var(--bad-bg);
    color: var(--bad);
    border-color: transparent;
  }
  .columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: 20px;
    align-items: start;
  }
  @media (max-width: 900px) {
    .columns {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .main {
    display: grid;
    gap: 14px;
    min-width: 0;
  }
  aside {
    display: grid;
    gap: 12px;
  }
  .box {
    padding: 12px 16px;
    display: grid;
    gap: 6px;
  }
  .box h2 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--faint);
  }
  .box p {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .small {
    font-size: 13px;
  }
  .line {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .item {
    overflow-wrap: anywhere;
  }
  .notice {
    margin: 0;
    padding: 8px 14px;
    border-radius: 8px;
    background: var(--warn-bg);
    color: var(--warn);
    font-size: 14px;
  }
  .summary {
    margin: 0;
    font-size: 14px;
  }
  .plus {
    color: var(--added-ink);
    font-family: var(--mono);
  }
  .minus {
    color: var(--removed-ink);
    font-family: var(--mono);
  }
  .empty {
    padding: 20px;
  }
  .gone {
    padding: 16px 20px;
    max-width: 720px;
  }
  .gone p {
    margin: 0 0 6px;
  }
  .error {
    margin: 0 0 12px;
  }
</style>
