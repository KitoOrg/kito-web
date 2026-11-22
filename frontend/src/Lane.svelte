<script>
  // A lane, read the way a change is reviewed: what was said, what it
  // changes, what stands in its way, and why the code it touches is the
  // way it is. Beside them: who reviewed it, its scope, who else is on
  // its code. Under them: the review being written, and integrating.
  import { untrack } from 'svelte';
  import { ask, laneLink, watch } from './api.js';
  import { assistantOf } from './assistants.js';
  import { checksOf, stopping } from './checks.js';
  import { count, laneName, laneTitle, tasked, who } from './format.js';
  import { loadDrafts, saveDrafts } from './review.js';
  import { verdictStanding } from './standing.js';
  import { toast } from './toast.svelte.js';
  import Assistant from './Assistant.svelte';
  import Confirm from './Confirm.svelte';
  import Empty from './Empty.svelte';
  import Err from './Err.svelte';
  import FileDiff from './FileDiff.svelte';
  import Integrate from './Integrate.svelte';
  import LaneChecks from './LaneChecks.svelte';
  import LaneTalk from './LaneTalk.svelte';
  import LaneWhy from './LaneWhy.svelte';
  import Loading from './Loading.svelte';
  import PageHead from './PageHead.svelte';
  import ReviewBar from './ReviewBar.svelte';
  import State from './State.svelte';
  import Time from './Time.svelte';

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

  // Behind a server, somebody who may only read changes nothing here.
  let mayWrite = $derived(role !== 'read');
  // Integrating is for those the repository says may, and for anybody on
  // their own machine. Asked by somebody else, the lane is merged and
  // checked, then waits for one of them.
  let mayIntegrate = $derived(!role || role === 'integrate' || role === 'maintain');

  // The review being written: its comments wait here until it is sent.
  let drafts = $state(untrack(() => loadDrafts(lane)));
  $effect(() => saveDrafts(lane, drafts));
  const draft = (one) => (drafts = [...drafts, { ...one, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }]);
  const undraft = (id) => (drafts = drafts.filter((one) => one.id !== id));
  async function sent(clear = true) {
    if (clear) drafts = [];
    await load();
    if (since) await loadSince();
  }

  // What changed since the verdict of who is signed in, instead of all of it.
  let sinceMine = $state(false);
  let since = $state(null);
  async function loadSince() {
    try {
      since = await ask('changes_since_review', { lane });
    } catch (error) {
      since = { files: [], error: error.message };
    }
  }
  $effect(() => {
    if (sinceMine) loadSince();
    else since = null;
  });

  // Integrating is asked for in the review bar, and answered under the head.
  let integrator = $state(null);
  let integrating = $state(false);
  async function integrate() {
    integrating = true;
    try {
      await integrator?.integrate();
    } finally {
      integrating = false;
    }
  }

  let closeFailed = $state('');
  async function closeLane() {
    closeFailed = '';
    try {
      await ask('close_lane', { lane });
      toast(`${nameOf(info)} closed`);
      location.hash = '#/';
    } catch (error) {
      closeFailed = error.message;
    }
  }

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
      const id = laneName(lane);
      closed = all.find((one) => one.state === 'closed' && (one.id === id || one.name === lane)) ?? null;
    } catch {
      // What was said first stands.
    }
  }

  // Asked again when the resolved comments are wanted too, or no longer.
  // What is there stays meanwhile: an answer may be being written in it.
  $effect(() => {
    resolved;
    load();
  });

  $effect(() => {
    // Told when something happens to this lane, or is integrated under it.
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
  let beside = $derived.by(() => {
    const found = new Map();
    for (const one of seen?.overlaps ?? []) {
      if (!['function', 'caller'].includes(one.kind)) continue;
      if (!found.has(one.lane) || one.kind === 'function') found.set(one.lane, one);
    }
    return [...found.values()];
  });

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

  // Whether who is signed in gave a verdict: then they may see what changed since.
  let reviewed = $derived(Boolean(review?.verdicts.some((verdict) => user === null || verdict.by === user)));
  let shownFiles = $derived(sinceMine && since ? since.files : (diff?.files ?? []));

  // A lane as it is written, and as its page is headed: by its task, or
  // by what it is for. A task of the repository is linked beside it instead.
  const back = { href: '#/', label: 'Lanes' };
  const nameOf = (it) => laneName(it.name ?? it.id);
  const titleOf = (it) => laneTitle(it) ?? nameOf(it);
</script>

<!-- A lane that is named: the main one has no page of its own. -->
{#snippet named(id)}
  {#if id === 'main'}<span class="ref">main</span>{:else}<a class="ref" href={laneLink(id)}>{laneName(id)}</a>{/if}
{/snippet}

<!-- What is said of a lane under its title, open or closed: its name (unless
     that is the title), the task it is for, who works in it and in what. -->
{#snippet whose(it)}
  {#if titleOf(it) !== nameOf(it)}
    <span class="ref">{nameOf(it)}</span>{#if tasked(it)}{' '}for {@render task(it)}{/if} ·
  {:else if tasked(it)}
    For {@render task(it)} ·
  {/if}
  <Assistant assistant={it.assistant} />
  {who(it.agent, it.owner)}
  {#if it.assistant?.model}· <span class="mono">{it.assistant.model}</span>{/if}
{/snippet}

{#snippet task(it)}<a class="ref" href={`#/tasks?task=${encodeURIComponent(it.task)}`}>{it.task}</a>{/snippet}

{#snippet closing()}
  <Confirm
    label="Close the lane"
    ask={`Close ${nameOf(info)}? Its last changes are recorded and its working copy is removed; what was not integrated stays in its history.`}
    onyes={closeLane}
    disabled={integrating}
    working="Closing…"
  />
{/snippet}

{#if info === null && closed}
  <PageHead title={titleOf(closed)} name={nameOf(closed)} {back}>
    {#snippet after()}<State lane={closed} />{/snippet}
    {#snippet lead()}{@render whose(closed)}{/snippet}
  </PageHead>
  <Empty title="This lane is closed">
    <p>What it integrated is in the <a href="#/log">Log</a>.</p>
    {#if closed.scope?.length > 0}
      <p>Its scope: <span class="mono">{closed.scope.join(', ')}</span></p>
    {/if}
  </Empty>
{:else if info === null}
  <PageHead title={laneName(lane)} {back} />
  {#if failed}
    <Err message={failed} />
  {:else}
    <Loading lines={4} />
  {/if}
{:else}
  <PageHead title={titleOf(info)} name={nameOf(info)} {back} docs="a-lane" actions={mayWrite && !info.name ? closing : null}>
    {#snippet after()}<State lane={info} />{/snippet}
    {#snippet lead()}
      {@render whose(info)}
      · {count(diff.files.length, 'file')} into {@render named(diff.onto)}
      {#if seen?.last_change_ms}· changed <Time ms={seen.last_change_ms} />{/if}
    {/snippet}
  </PageHead>
  <Err message={closeFailed} />
  {#if mayWrite}
    <Integrate bind:this={integrator} {lane} {info} changed={load} talk={here('conversation')} />
  {/if}
  <Err message={failed} />

  <nav class="subtabs" aria-label="Parts of the lane">
    {#each parts as [name, label, n] (name)}
      <a href={here(name)} aria-current={part === name ? 'page' : undefined}>
        {label}{#if n > 0}<span class={['count', name === 'checks' && 'bad']}>{n}</span>{/if}
      </a>
    {/each}
  </nav>

  <div class="cols">
    <div class="stack">
      {#if part === 'conversation'}
        <LaneTalk
          {lane}
          {info}
          title={titleOf(info)}
          {seen}
          {threads}
          verdicts={review.verdicts}
          {conflicts}
          target={diff.onto}
          bind:resolved
          changed={load}
          {mayWrite}
        />
      {:else if part === 'changes'}
        <div class="summary">
          <p class="soft">
            {#if !sinceMine}
              <span class="plus">+{totals.added}</span> <span class="minus">−{totals.removed}</span>
              against <span class="ref">{diff.base}</span>
            {:else if since?.verdict}
              Since your verdict (<span class="mono">{since.verdict}</span>, <Time ms={since.at_ms} />), against what you saw then
            {:else}
              Since your verdict
            {/if}
          </p>
          {#if reviewed}
            <div class="seg" role="group" aria-label="Which changes">
              <button aria-pressed={!sinceMine} onclick={() => (sinceMine = false)}>All changes</button>
              <button aria-pressed={sinceMine} onclick={() => (sinceMine = true)}>Since my review</button>
            </div>
          {/if}
        </div>
        {#if sinceMine && since === null}
          <Loading />
        {:else if sinceMine && since.error}
          <Err message={since.error} />
        {:else if shownFiles.length === 0}
          {#if sinceMine}
            <Empty title="Nothing changed since your review" />
          {:else}
            <Empty title="No changes yet" />
          {/if}
        {:else}
          {#each shownFiles as file (`${sinceMine}-${file.path}`)}
            <FileDiff
              {lane}
              {file}
              threads={inFile(file.path)}
              changed={load}
              drafts={drafts.filter((one) => one.path === file.path)}
              draft={mayWrite ? draft : null}
              {undraft}
              {mayWrite}
            />
          {/each}
        {/if}
      {:else if part === 'checks'}
        <LaneChecks {rows} />
      {:else}
        <LaneWhy {lane} id={info.id} {targets} />
      {/if}
    </div>

    <aside class="stack side">
      <section class="panel pad box">
        <h3>Review</h3>
        {#each review.verdicts as verdict (`${verdict.by} ${verdict.at_ms}`)}
          <p>
            {who(verdict.by, verdict.for)}
            <State said={verdictStanding(verdict.verdict)} plain />
            <span class="small faint">· <Time ms={verdict.at_ms} /></span>
          </p>
        {:else}
          <p class="none">None yet</p>
        {/each}
      </section>

      <section class="panel pad box">
        <h3>Scope</h3>
        {#if info.scope?.length > 0}
          <ul class="scope">
            {#each info.scope as item}<li class="mono">{item}</li>{/each}
          </ul>
        {:else}
          <p class="none">None</p>
        {/if}
        {#if seen?.broad}<p class="hint">Broad: it covers {count(seen.scope_files, 'file')}.</p>{/if}
      </section>

      {#if beside.length > 0}
        <section class="panel pad box">
          <h3>On the same code</h3>
          {#each beside as other (other.lane)}
            <p>
              <a class="ref" href={laneLink(other.lane)}>{laneName(other.lane)}</a>
              ({who(other.agent, other.owner)}): <span class="soft">{other.detail}</span>
            </p>
          {/each}
        </section>
      {/if}

      <section class="panel pad box">
        <h3>Agent</h3>
        {#if info.assistant?.name}
          <p>
            Runs in {assistantOf(info.assistant).label}{info.assistant.version ? ` ${info.assistant.version}` : ''}, as it said of
            itself.
          </p>
        {:else}
          <p class="soft">Nothing says which assistant it runs in.</p>
        {/if}
      </section>
    </aside>
  </div>

  {#if mayWrite}
    <ReviewBar
      {lane}
      {info}
      {drafts}
      {review}
      {stops}
      {user}
      {mayIntegrate}
      {integrating}
      {sent}
      {integrate}
      checks={here('checks')}
    />
  {/if}
{/if}

<style>
  .summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }
  /* A path is broken where the column ends, not the column by a path. */
  .side {
    overflow-wrap: anywhere;
  }
  .scope {
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
