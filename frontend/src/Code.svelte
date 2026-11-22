<script>
  // The code, and why it is the way it is: the files on the left, a file
  // beside them with an edge on each line in the colour of the reason it
  // was last written for, and at its side what that reason was. Earlier
  // work is found by the words of its reason.
  import { ask, fileText, laneLink, whyLink } from './api.js';
  import { count, laneName, who } from './format.js';
  import Empty from './Empty.svelte';
  import Err from './Err.svelte';
  import Icon from './Icon.svelte';
  import Loading from './Loading.svelte';
  import PageHead from './PageHead.svelte';
  import Time from './Time.svelte';

  // `file`: the one that is read (none: pick one). `lane`: as that lane
  // has it, instead of the main lane.
  let { file = null, lane = null } = $props();

  let files = $state(null);
  let listFailed = $state('');
  let graph = $state(null);
  let text = $state(null);
  let failed = $state('');
  // The line that is asked about, and the reason whose lines are pointed out.
  let line = $state(null);
  let shown = $state(null);

  // The words typed, what was found for the words last searched, and those words.
  let words = $state('');
  let found = $state(null);
  let searched = $state('');
  let searching = $state(false);
  let searchFailed = $state('');

  $effect(() => {
    ask('lane_files', lane ? { lane } : {})
      .then((listed) => (files = listed.files.map((one) => one.path)))
      .catch((error) => (listFailed = error.message));
  });

  $effect(() => {
    if (!file) return;
    let stopped = false;
    const params = lane ? { target: file, lane } : { target: file };
    Promise.all([ask('why_graph', params), fileText(file, lane)]).then(
      ([answer, content]) => {
        if (stopped) return;
        [graph, text, failed] = [answer, content, ''];
      },
      (error) => !stopped && (failed = error.message),
    );
    return () => (stopped = true);
  });

  async function search() {
    const about = words;
    searching = true;
    searchFailed = '';
    try {
      found = await ask('reasons', { about, limit: 30 });
      searched = about.trim();
    } catch (error) {
      searchFailed = error.message;
    } finally {
      searching = false;
    }
  }

  // Files under the directory each is in.
  let folders = $derived.by(() => {
    const folders = new Map();
    for (const path of files ?? []) {
      const at = path.lastIndexOf('/');
      const folder = at < 0 ? '' : path.slice(0, at + 1);
      if (!folders.has(folder)) folders.set(folder, []);
      folders.get(folder).push(path);
    }
    return [...folders.entries()].sort(([a], [b]) => a.localeCompare(b));
  });

  // The reason each line was last written for, by its number; a line
  // older than what the history tells has none.
  let reasonOf = $derived.by(() => {
    const of = new Map();
    for (const run of graph?.lines ?? []) {
      if (run.reason === null || run.reason === undefined) continue;
      for (let n = run.from; n <= run.to; n += 1) of.set(n, run.reason);
    }
    return of;
  });
  let code = $derived(text === null ? [] : text.replace(/\n$/, '').split('\n'));
  let reasons = $derived(graph?.reasons ?? []);
  let notes = $derived(graph?.annotations ?? []);
  let asked = $derived(line !== null && reasonOf.has(line) ? reasons[reasonOf.get(line)] : null);
  // The function a line is in, when the file has functions.
  const inside = (n) => (graph?.contains ?? []).filter((item) => item.line && item.line <= n).at(-1);
  // A function as it is called, without the file it is in.
  const called = (symbol) => symbol.slice(symbol.lastIndexOf(':') + 1);

  function pick(n) {
    line = line === n ? null : n;
    shown = line !== null && reasonOf.has(n) ? reasonOf.get(n) : null;
  }
</script>

{#snippet inLane()}As <a class="ref" href={laneLink(lane)}>{laneName(lane)}</a> has it{/snippet}

<PageHead title="Code and why" docs="code-and-why" lead={lane ? inLane : null} />

<Err message={listFailed} />

<div class="cols left">
  <nav class="panel groups" aria-label="Files">
    <form
      class="panel-head"
      onsubmit={(event) => {
        event.preventDefault();
        search();
      }}
    >
      <input class="sm grow" bind:value={words} placeholder="Words of a reason" aria-label="Words of a reason" />
      <button class="sm" disabled={searching || words.trim() === ''}>Search</button>
    </form>
    {#if searchFailed}<div class="pad"><Err message={searchFailed} /></div>{/if}
    {#if searching}
      <Loading inset lines={3} label="Searching…" />
    {:else if found !== null}
      <section class="found" aria-label="What the search found">
        <div class="found-head">
          <h4>Reasons with <q>{searched}</q></h4>
          {#if found.length > 0}<span class="count">{found.length}</span>{/if}
          <span class="grow"></span>
          <button class="quiet sm icon" aria-label="Close" onclick={() => (found = null)}><Icon name="close" /></button>
        </div>
        {#if found.length === 0}
          <Empty inset title="No reason has those words" />
        {:else}
          <ul class="rows tight">
            {#each found as hit}
              <li>
                <div class="row">
                  <div class="row-body">
                    <span class="row-title"><q class="reason">{hit.why}</q></span>
                    <span class="row-meta">
                      {who(hit.by.join(', '), hit.for)}{#if hit.lane}&nbsp;· <a class="ref" href={laneLink(hit.lane)}>{laneName(hit.lane)}</a>{/if}{#if hit.checkpoint}&nbsp;· <span class="ref">{hit.checkpoint}</span>{/if}
                      · <Time ms={hit.at_ms} />
                    </span>
                    <span class="row-meta">
                      {#each hit.changed as target}<a class="ref" href={whyLink(target)}>{target}</a>{' '}{/each}
                      {#if hit.changed_more}<span class="faint">and {hit.changed_more} more</span>{/if}
                    </span>
                  </div>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}
    {#if files === null}
      {#if !listFailed}<Loading inset lines={5} />{/if}
    {:else if files.length === 0}
      <Empty inset title="No file yet">{lane ? 'This lane' : 'The main lane'} has none.</Empty>
    {:else}
      {#each folders as [folder, paths]}
        <h4 class="mono">{folder || './'}</h4>
        <ul class="rows tight">
          {#each paths as path}
            <li>
              <a class="row" href={whyLink(path, lane)} aria-current={path === file ? 'true' : undefined}>
                <span class="row-title mono">{path.slice(folder.length)}</span>
              </a>
            </li>
          {/each}
        </ul>
      {/each}
    {/if}
  </nav>

  {#if !file}
    {#if files?.length !== 0}
      <Empty title="Pick a file" />
    {/if}
  {:else if failed}
    <Err message={failed} />
  {:else if graph === null}
    <div class="panel"><Loading inset lines={6} /></div>
  {:else}
    <div class="cols">
      <section class="panel">
        <div class="panel-head">
          <h3 class="mono">{file}</h3>
          <span class="grow"></span>
          <span class="small soft">
            {count(code.length, 'line')} · {count(reasons.length, 'reason')}{#if notes.length > 0}&nbsp;· {count(notes.length, 'note')}{/if}
          </span>
        </div>
        {#if text === null}
          <Empty inset title="No text to show" />
        {:else}
          <div class="pad">
            <div class="code" role="group" aria-label={`The lines of ${file}: press one to read its reason`}>
              {#each code as content, index}
                {@const n = index + 1}
                {@const reason = reasonOf.get(n)}
                <button
                  class={['bare', 'line', reason !== undefined && `hue-${reason % 6}`, line === n && 'asked', shown !== null && reason !== shown && 'dim']}
                  aria-pressed={line === n}
                  onclick={() => pick(n)}
                >
                  <span class="number">{n}</span>
                  <span>{content}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </section>

      <aside class="stack side">
        {#if line !== null}
          <section class="panel pad box">
            <h3>Why line {line}</h3>
            {#if asked}
              {@const at = inside(line)}
              <p><q class="reason">{asked.why}</q></p>
              <p class="small soft">
                {who(asked.by, asked.for)}{#if asked.how?.length > 0}&nbsp;· {asked.how.join(', ')}{/if}{#if asked.lane}&nbsp;· <a class="ref" href={laneLink(asked.lane)}>{laneName(asked.lane)}</a>{/if}
                · {#if asked.checkpoint}<span class="ref">{asked.checkpoint}</span>{:else}not integrated yet{/if}
                · <Time ms={asked.at_ms} />
              </p>
              {#if asked.reviewed_by?.length > 0}<p class="small soft">Reviewed by {asked.reviewed_by.join(', ')}</p>{/if}
              {#if at}
                <p class="small">In <a class="ref" href={whyLink(at.symbol, lane)}>{called(at.symbol)}</a>: all of its reasons</p>
              {/if}
            {:else}
              <p class="none">None</p>
            {/if}
          </section>
        {/if}

        <section class="panel pad box">
          <h3>Reasons</h3>
          {#each reasons as reason, index}
            <button
              class={['bare', 'why', `hue-${index % 6}`]}
              aria-pressed={shown === index}
              onclick={() => ((shown = shown === index ? null : index), (line = null))}
            >
              <span class="row-body">
                <span class="row-title"><q class="reason">{reason.why}</q></span>
                <span class="row-meta">
                  {who(reason.by, reason.for)}{#if reason.checkpoint}&nbsp;· <span class="ref">{reason.checkpoint}</span>{:else if reason.lane}&nbsp;· <span class="ref">{laneName(reason.lane)}</span>{/if}
                  · <Time ms={reason.at_ms} />
                </span>
              </span>
            </button>
          {:else}
            <p class="none">None yet</p>
          {/each}
        </section>

        {#if graph.in_progress?.length > 0}
          <section class="panel pad box">
            <h3>Being changed now</h3>
            {#each graph.in_progress as work}
              <p>
                <a class="ref" href={laneLink(work.lane)}>{laneName(work.lane)}</a> · {who(work.agent, work.for)}
                {#if work.intent}<br /><q class="reason">{work.intent}</q>{/if}
              </p>
            {/each}
          </section>
        {/if}

        {#if graph.contains?.length > 0}
          <section class="panel pad box">
            <h3>Its functions</h3>
            {#each graph.contains as item}
              <p>
                <a class="ref" href={whyLink(item.symbol, lane)}>{called(item.symbol)}</a>
                {#if item.line}<span class="small faint">line {item.line}</span>{/if}
              </p>
            {/each}
          </section>
        {/if}

        {#if notes.length > 0}
          <section class="panel pad box">
            <h3>Notes</h3>
            {#each notes as note (note.id)}
              <div class="row-body">
                <span class="said">{note.text}</span>
                <span class="row-meta">{who(note.by, note.for)} · on <span class="ref">{note.on}</span></span>
              </div>
            {/each}
          </section>
        {/if}
      </aside>
    </div>
  {/if}
</div>

<style>
  /* What a search found stands over the files, until it is closed. */
  .found {
    border-bottom: 1px solid var(--line);
  }
  .found-head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 4px 0 12px;
  }
  .found-head h4 {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  /* A line of the file: its number, its text, and at its edge the colour
     of the reason it was last written for. */
  .line {
    display: grid;
    grid-template-columns: 44px 1fr;
    gap: 0 8px;
    width: 100%;
    min-width: max-content;
    border-left: 3px solid var(--hue, transparent);
    white-space: pre;
  }
  .line:hover,
  .line.asked {
    background: color-mix(in srgb, var(--hue, var(--soft)) 14%, transparent);
  }
  .line.dim {
    opacity: 0.4;
  }
  .line:focus-visible {
    outline-offset: -2px;
  }
  .number {
    text-align: right;
    color: var(--faint);
    user-select: none;
  }
  /* What stands beside the file is read in a narrow column: a long word breaks. */
  .side {
    overflow-wrap: anywhere;
  }
  /* A reason, with the colour its lines have. */
  .why {
    display: block;
    width: 100%;
    padding: 4px 8px;
    border-left: 3px solid var(--hue);
  }
  .why:hover {
    background: var(--hover);
  }
  .why[aria-pressed='true'] {
    background: color-mix(in srgb, var(--hue) 14%, transparent);
  }
</style>
