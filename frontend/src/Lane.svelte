<script>
  // A lane, read the way a change is reviewed: what was said, what it
  // changes, what stands in its way, and why the code it touches is the
  // way it is. Beside them: who reviewed it, its scope, who else is on
  // its code. Under them: the review being written, and integrating.
  // A closed lane (Kito 0.41) is read the same way, and nothing in it
  // changes: how it ended, what each integration made, what it left.
  import { untrack } from 'svelte';
  import { ask, checkpointLink, laneLink, watch } from './api.js';
  import { assistantOf } from './assistants.js';
  import { checksOf, keptOf, stopping } from './checks.js';
  import { count, laneName, laneTitle, tasked, who } from './format.js';
  import { loadDrafts, saveDrafts } from './review.js';
  import { verdictStanding } from './standing.js';
  import { toast } from './toast.svelte.js';
  import Assistant from './Assistant.svelte';
  import Confirm from './Confirm.svelte';
  import Empty from './Empty.svelte';
  import Ended from './Ended.svelte';
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
  // Its rule for the reasons of each change (Kito 0.42): `required`, `asked`, `off`; null from an older one.
  let reasons = $state(null);
  let resolved = $state(false);
  let failed = $state('');
  // A lane that is closed, where the server answers nothing else of it
  // (before Kito 0.41): what is still known of it.
  let closed = $state(null);

  // A closed lane the server still reads (Kito 0.41): what each of its
  // integrations made, as its checkpoint and that checkpoint's diff.
  let ended = $derived(info?.state === 'closed');
  // Each with what could not be had of it: its checks (`pointFailed`), its diff (`filesFailed`).
  let kept = $state(null);
  let keeping = false;
  async function loadKept(status) {
    const made = (status.integrations ?? []).filter((one) => one.checkpoint);
    kept = await Promise.all(
      made.map(async (one) => {
        const [[point, pointFailed], [changes, filesFailed]] = await Promise.all([
          settle(ask('checkpoint_info', { checkpoint: one.checkpoint })),
          settle(ask('diff', { to: one.checkpoint })),
        ]);
        return { id: one.checkpoint, into: one.into, point, pointFailed, files: changes?.files ?? [], filesFailed };
      }),
    );
  }
  // The parts of a closed lane the server did not give, and why.
  let missing = $state({ diff: '', said: '', review: '' });

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

  // What a request answered, or why it did not: `[value, '']` or `[null, message]`.
  const settle = (asked) => asked.then(
    (value) => [value, ''],
    (error) => [null, error.message],
  );

  async function load() {
    // The diff first: it records what was saved in the lane a moment ago.
    const [changes, diffFailed] = await settle(ask('lane_diff', { lane }));
    const [[status, statusFailed], [said, saidFailed], [stands, standsFailed], [board], [repository]] = await Promise.all([
      settle(ask('lane_status', { lane })),
      settle(ask('comments', { lane, all: resolved })),
      settle(ask('review', { lane })),
      settle(ask('board')),
      settle(ask('status')),
    ]);
    // A lane the server does not read: none, or one closed before Kito
    // 0.41, which refuses its status. Then what is still known of it.
    if (status === null || (changes === null && status.state !== 'closed')) {
      failed = statusFailed || diffFailed;
      if (info === null) await gone();
      return;
    }
    const over = status.state === 'closed';
    // An open lane is read whole; what stays on the page meanwhile is what it was.
    if (!over && (said === null || stands === null)) {
      failed = saidFailed || standsFailed;
      return;
    }
    // Of a closed lane, what can be had: a part that cannot says so in its place.
    diff = changes ?? { files: [], onto: status.target ?? 'main', base: '' };
    [info, comments, review, failed] = [status, said ?? [], stands ?? { verdicts: [] }, ''];
    missing = { diff: changes === null ? diffFailed : '', said: said === null ? saidFailed : '', review: stands === null ? standsFailed : '' };
    seen = (board ?? []).find((one) => one.id === status.id) ?? null;
    commands = repository?.repo?.checks ?? [];
    reasons = repository?.repo?.reasons ?? null;
    // What a closed lane integrated does not change: asked once.
    if (over && !keeping) {
      keeping = true;
      loadKept(status);
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
  let conflicts = $derived(ended ? [] : (info?.conflicts ?? []).filter((conflict) => typeof conflict === 'object' && !conflict.resolved));

  // Every file a closed lane changed: what it integrated, then what it left.
  let changedFiles = $derived(ended ? [...(kept ?? []).flatMap((group) => group.files), ...(diff?.files ?? [])] : (diff?.files ?? []));
  // What a closed lane's checkpoints kept of its checks and its review, one list each.
  let keptRows = $derived((kept ?? []).map((group) => ({ id: group.id, rows: group.point ? keptOf(group.point) : [], failed: group.pointFailed })));
  // A file is shown with what was said on it once: where it first comes.
  let firstOf = $derived.by(() => {
    const first = new Map();
    for (const group of kept ?? []) for (const file of group.files) if (!first.has(file.path)) first.set(file.path, group.id);
    for (const file of diff?.files ?? []) if (!first.has(file.path)) first.set(file.path, '');
    return first;
  });
  const threadsIn = (group, path) => (firstOf.get(path) === group ? inFile(path) : []);

  let totals = $derived(
    (diff?.files ?? []).reduce((sum, file) => ({ added: sum.added + file.added, removed: sum.removed + file.removed }), {
      added: 0,
      removed: 0,
    }),
  );

  // What the lane changed, for its reasons: functions where the file has
  // them, the file itself where it has none.
  let targets = $derived.by(() => {
    const found = new Map();
    for (const file of changedFiles) {
      const symbols = (file.symbols ?? []).filter((symbol) => symbol.change !== 'removed');
      if (symbols.length > 0) for (const symbol of symbols) found.set(symbol.symbol, { target: symbol.symbol, kind: 'function', change: symbol.change });
      else if (file.change !== 'removed') found.set(file.path, { target: file.path, kind: 'file', change: file.change });
    }
    return [...found.values()];
  });

  // What it changed and has not said why for yet: an open lane's, under a rule that asks.
  let unexplained = $derived(ended || !reasons || reasons === 'off' ? [] : (info?.unexplained ?? []));
  // Where a change is shown in the Changes: a function's file, or the file.
  const placeOf = (on) => `${here('changes')}&at=${encodeURIComponent(on)}`;

  let rows = $derived(
    info && diff && review ? checksOf({ info, diff, review, checks: commands, conflicts, reasons: ended ? null : reasons, placeOf }) : [],
  );
  let stops = $derived(ended ? keptRows.reduce((sum, group) => sum + stopping(group.rows), 0) : stopping(rows));
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
    ['changes', 'Changes', ended ? new Set(changedFiles.map((file) => file.path)).size : (diff?.files.length ?? 0)],
    ['checks', 'Checks', stops],
    ['why', 'Why', targets.length],
  ]);
  let part = $derived(parts.some(([name]) => name === tab) ? tab : 'conversation');

  $effect(() => {
    // From a comment to the file it is on; from the Checks to a change
    // with no reason yet, or to its file when that is folded.
    if (part !== 'changes' || !at || !diff || (ended && kept === null)) return;
    const file = diff.files.find((one) => at.startsWith(`${one.path}:`))?.path ?? at;
    queueMicrotask(() =>
      (document.getElementById(`reason-${at}`) ?? document.getElementById(`file-${file}`))?.scrollIntoView({ block: 'start' }),
    );
  });

  // Whether who is signed in gave a verdict: then they may see what changed since.
  let reviewed = $derived(!ended && Boolean(review?.verdicts.some((verdict) => user === null || verdict.by === user)));
  // Nothing of a closed lane is changed from here.
  let mayChange = $derived(mayWrite && !ended);
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

<!-- Over what a closed lane integrated as a checkpoint (`id`), or over what it left. -->
{#snippet changeHead(files, id, into)}
  <div class="section-head">
    <h2 class="section-title">
      {#if id}
        Integrated as <a class="ref" href={checkpointLink(id)}>{id}</a>{#if into && into !== 'main'}{' '}into {@render named(into)}{/if}
      {:else}
        Not integrated
      {/if}
    </h2>
    {#if files.length > 0}
      <span class="plus">+{files.reduce((sum, file) => sum + file.added, 0)}</span>
      <span class="minus">−{files.reduce((sum, file) => sum + file.removed, 0)}</span>
    {/if}
  </div>
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
    <p>What it integrated is in the <a href="#/history">History</a>.</p>
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
  <PageHead title={titleOf(info)} name={nameOf(info)} {back} docs="a-lane" actions={mayChange && !info.name ? closing : null}>
    {#snippet after()}<State lane={info} />{/snippet}
    {#snippet lead()}
      {@render whose(info)}
      {#if ended}
        <span class="ended"><Ended lane={info} capital /></span>
      {:else}
        · {count(diff.files.length, 'file')} into {@render named(diff.onto)}
        {#if seen?.last_change_ms}· changed <Time ms={seen.last_change_ms} />{/if}
      {/if}
    {/snippet}
  </PageHead>
  <Err message={closeFailed} />
  {#if mayChange}
    <Integrate bind:this={integrator} {lane} {info} changed={load} talk={here('conversation')} checks={here('checks')} />
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
        <Err message={missing.said} />
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
          mayWrite={mayChange}
        />
      {:else if part === 'changes' && ended}
        <!-- What each integration made, under its checkpoint; then what it left. -->
        {#if kept === null}
          <Loading />
        {:else}
          {#each kept as group (group.id)}
            {@render changeHead(group.files, group.id, group.into)}
            <Err message={group.filesFailed} />
            {#each group.files as file (file.path)}
              <FileDiff {lane} at={group.id} {file} threads={threadsIn(group.id, file.path)} changed={load} mayWrite={false} viewing={false} />
            {/each}
          {/each}
          {#if missing.diff}
            {@render changeHead([], null, null)}
            <Err message={missing.diff} />
          {:else if diff.files.length > 0}
            {@render changeHead(diff.files, null, null)}
            {#each diff.files as file (file.path)}
              <FileDiff {lane} {file} threads={threadsIn('', file.path)} changed={load} mayWrite={false} viewing={false} />
            {/each}
          {/if}
          {#if changedFiles.length === 0 && !missing.diff && !kept.some((group) => group.filesFailed)}
            <Empty title="No changes" />
          {/if}
        {/if}
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
      {:else if part === 'checks' && ended}
        {#if kept === null}
          <Loading />
        {:else if keptRows.length === 0}
          <Empty title={(info.integrations ?? []).length === 0 ? 'Never integrated' : 'No checkpoint was made'} />
        {:else}
          {#each keptRows as group (group.id)}
            {#if keptRows.length > 1}
              <h2 class="section-title">Integrated as <a class="ref" href={checkpointLink(group.id)}>{group.id}</a></h2>
            {/if}
            {#if group.failed}
              <Err message={group.failed} />
            {:else}
              <LaneChecks rows={group.rows} foot={null} />
            {/if}
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
        <Err message={missing.review} />
        {#each review.verdicts as verdict (`${verdict.by} ${verdict.at_ms}`)}
          <p>
            {who(verdict.by, verdict.for)}
            <State said={verdictStanding(verdict.verdict)} plain />
            <span class="small faint">· <Time ms={verdict.at_ms} /></span>
          </p>
        {:else}
          {#if !missing.review}<p class="none">None yet</p>{/if}
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

  {#if mayChange}
    <ReviewBar
      {lane}
      {info}
      {drafts}
      {review}
      {stops}
      unexplained={unexplained.length}
      holds={reasons === 'required'}
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
  /* How a closed lane ended: a line of its own under who worked in it. */
  .ended {
    display: block;
  }
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
