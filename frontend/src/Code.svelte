<script>
  // The code, and why it is the way it is: the files on the left, a file
  // in the middle with a stripe beside each line for the reason it was
  // last written for, and on the right what that reason was. Earlier work
  // is found by the words of its reason.
  import { ago, ask, fileText, laneLink, whyLink } from './api.js';
  import Empty from './Empty.svelte';
  import Loading from './Loading.svelte';

  // `file`: the one that is read (none: pick one). `lane`: as that lane
  // has it, instead of the main lane.
  let { file = null, lane = null } = $props();

  let files = $state(null);
  let failed = $state('');
  let graph = $state(null);
  let text = $state(null);
  // The line that is asked about, and the reason whose lines are pointed out.
  let line = $state(null);
  let shown = $state(null);

  let words = $state('');
  let found = $state(null);
  let searching = $state(false);

  $effect(() => {
    ask('lane_files', lane ? { lane } : {})
      .then((listed) => (files = listed.files.map((one) => one.path)))
      .catch((error) => (failed = error.message));
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
    searching = true;
    try {
      found = await ask('reasons', { about: words, limit: 30 });
      failed = '';
    } catch (error) {
      failed = error.message;
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

  // The reason each line was last written for, by its number.
  let reasonOf = $derived.by(() => {
    const of = new Map();
    for (const run of graph?.lines ?? []) {
      for (let n = run.from; n <= run.to; n += 1) of.set(n, run.reason);
    }
    return of;
  });
  let code = $derived(text === null ? [] : text.replace(/\n$/, '').split('\n'));
  let reasons = $derived(graph?.reasons ?? []);
  let asked = $derived(line !== null && reasonOf.has(line) ? reasons[reasonOf.get(line)] : null);
  // The function a line is in, when the file has functions.
  const inside = (n) => (graph?.contains ?? []).filter((item) => item.line && item.line <= n).at(-1);

  const edge = (reason) => `hsl(${(reason * 67 + 245) % 360} 55% 55%)`;
  const tint = (reason) => `hsl(${(reason * 67 + 245) % 360} 60% 55% / 0.14)`;
  const who = (reason) => (reason.for ? `${reason.by} for ${reason.for}` : reason.by);

  function pick(n) {
    line = line === n ? null : n;
    shown = line !== null && reasonOf.has(n) ? reasonOf.get(n) : null;
  }
</script>

<h1 class="sr">Code and why</h1>

<div class="cols">
  <aside class="panel tree" aria-label="Files">
    <form
      onsubmit={(event) => {
        event.preventDefault();
        search();
      }}
    >
      <input class="sm" bind:value={words} placeholder="Find work by its reason: cents, task #7" aria-label="Words of a reason" />
      <button class="sm" disabled={searching || words.trim() === ''}>Find</button>
    </form>
    {#if found !== null}
      <div class="found">
        <p class="faint head">
          {found.length === 0 ? 'No reason has those words.' : `${found.length} ${found.length === 1 ? 'reason' : 'reasons'}`}
          <button class="quiet sm" onclick={() => (found = null)}>Clear</button>
        </p>
        {#each found as hit}
          <article>
            <p class="why">“{hit.why}”</p>
            <p class="faint">
              {hit.by.join(', ')}{#if hit.for}&nbsp;for {hit.for}{/if}
              {#if hit.lane}· <a href={laneLink(hit.lane)}>{hit.lane}</a>{/if}
              {#if hit.checkpoint}· {hit.checkpoint}{/if} · {ago(hit.at_ms)}
            </p>
            <p class="targets">
              {#each hit.changed as target}<a class="mono" href={whyLink(target)}>{target}</a>{/each}
              {#if hit.changed_more}<span class="faint">and {hit.changed_more} more</span>{/if}
            </p>
          </article>
        {/each}
      </div>
    {/if}
    {#if files === null && !failed}
      <Loading inset lines={5} />
    {:else if files?.length === 0}
      <p class="soft pad">{lane ? 'This lane' : 'The main lane'} has no file yet.</p>
    {:else}
      {#each folders as [folder, paths]}
        <p class="folder mono faint">{folder || './'}</p>
        <ul>
          {#each paths as path}
            <li>
              <a class="mono" href={whyLink(path, lane)} aria-current={path === file ? 'page' : undefined}>{path.slice(folder.length)}</a>
            </li>
          {/each}
        </ul>
      {/each}
    {/if}
  </aside>

  <div class="panel file">
    {#if failed}<p class="error">{failed}</p>{/if}
    {#if !file}
      <Empty inset title="Pick a file to read it with its reasons.">
        Beside each line, a stripe says which reason it was last written for. Point at a line to read it.
      </Empty>
    {:else if graph === null && !failed}
      <Loading inset lines={6} />
    {:else if graph}
      <header>
        <b class="mono">{file}</b>
        <span class="faint">
          {lane ? (lane.startsWith('lane/') || isNaN(lane) ? lane : `lane/${lane}`) : 'main'} · {code.length}
          {code.length === 1 ? 'line' : 'lines'} · {reasons.length}
          {reasons.length === 1 ? 'reason' : 'reasons'}
        </span>
        {#if (graph.annotations ?? []).length > 0}<span class="chip">{graph.annotations.length} {graph.annotations.length === 1 ? 'note' : 'notes'}</span>{/if}
      </header>
      {#if text === null}
        <p class="soft pad">This file has no text to show.</p>
      {:else}
        <div class="code" role="table" aria-label={`The lines of ${file} and their reasons`}>
          {#each code as content, index}
            {@const n = index + 1}
            {@const reason = reasonOf.get(n)}
            <button
              class="bare row"
              class:asked={line === n}
              class:dim={shown !== null && reason !== shown}
              style={reason === undefined ? '' : `--stripe:${edge(reason)};--wash:${tint(reason)}`}
              onclick={() => pick(n)}
              aria-pressed={line === n}
            >
              <span class="number">{n}</span>
              <span class="stripe" aria-hidden="true"></span>
              <span class="text">{content}</span>
            </button>
          {/each}
        </div>
      {/if}
    {/if}
  </div>

  {#if file && graph}
    <aside class="side">
      <section class="panel box">
        {#if asked}
          {@const at = inside(line)}
          <h2>Why line {line}</h2>
          <p class="why">{asked.why}</p>
          <p class="faint">
            {who(asked)}{#if asked.lane}&nbsp;· <a href={laneLink(asked.lane)}>{asked.lane}</a>{/if}
            · {asked.checkpoint ?? 'not integrated yet'} · {ago(asked.at_ms)}
          </p>
          {#if asked.how?.length > 0}<p class="faint">{asked.how.join(', ')}</p>{/if}
          {#if asked.reviewed_by?.length > 0}<p class="faint">reviewed by {asked.reviewed_by.join(', ')}</p>{/if}
          {#if at}
            <p class="small">In <a class="mono" href={whyLink(at.symbol, lane)}>{at.symbol.slice(at.symbol.lastIndexOf(':') + 1)}</a>: all of its reasons</p>
          {/if}
        {:else if line !== null}
          <h2>Why line {line}</h2>
          <p class="soft small">No reason is recorded for this line.</p>
        {:else}
          <h2>Its reasons</h2>
          <p class="faint">Newest first. Point at one to see the lines it wrote; at a line, to read its reason.</p>
        {/if}
      </section>

      <section class="panel box">
        <h2>{asked || line !== null ? 'Every reason of the file' : 'Reasons'}</h2>
        {#each reasons as reason, index}
          <button
            class="bare reason"
            aria-pressed={shown === index}
            onclick={() => ((shown = shown === index ? null : index), (line = null))}
            style={`--stripe:${edge(index)}`}
          >
            <span class="stripe" aria-hidden="true"></span>
            <span>
              <span class="why2">{reason.why}</span>
              <span class="faint">{who(reason)} · {reason.checkpoint ?? reason.lane ?? ''} · {ago(reason.at_ms)}</span>
            </span>
          </button>
        {:else}
          <p class="soft small">No reason is recorded for it.</p>
        {/each}
      </section>

      {#if graph.in_progress?.length > 0}
        <section class="panel box">
          <h2>Being changed now</h2>
          {#each graph.in_progress as work}
            <p class="small">
              <a href={laneLink(work.lane)}>{work.lane}</a> · {work.agent}{#if work.for}&nbsp;for {work.for}{/if}
              <br /><span class="soft">{work.intent ?? ''}</span>
            </p>
          {/each}
        </section>
      {/if}

      {#if graph.contains?.length > 0}
        <section class="panel box">
          <h2>Its functions</h2>
          {#each graph.contains as item}
            <p class="small">
              <a class="mono" href={whyLink(item.symbol, lane)}>{item.symbol.slice(item.symbol.lastIndexOf(':') + 1)}</a>
              {#if item.line}<span class="faint">line {item.line}</span>{/if}
            </p>
          {/each}
        </section>
      {/if}

      {#if graph.annotations?.length > 0}
        <section class="panel box">
          <h2>Notes</h2>
          {#each graph.annotations as note (note.id)}
            <p class="small">{note.text} <span class="faint">{note.by} · on <span class="mono">{note.on}</span></span></p>
          {/each}
        </section>
      {/if}
    </aside>
  {/if}
</div>

<style>
  .cols {
    display: grid;
    grid-template-columns: 230px minmax(0, 1fr) 290px;
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 1000px) {
    .cols {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .tree {
    padding: 10px 0;
    font-size: 13px;
  }
  form {
    display: flex;
    gap: 6px;
    padding: 0 10px 8px;
  }
  input {
    flex: 1;
  }
  .found {
    padding: 0 12px 8px;
    border-bottom: 1px solid var(--line);
    margin-bottom: 8px;
  }
  .found article {
    padding: 8px 0;
    border-top: 1px solid var(--line);
  }
  .found p {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 4px;
  }
  .why {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .targets {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 10px;
  }
  .folder {
    margin: 6px 12px 2px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li a {
    display: block;
    padding: 3px 12px 3px 24px;
    color: var(--ink);
    overflow-wrap: anywhere;
  }
  li a:hover {
    text-decoration: none;
    background: var(--bg);
  }
  li a[aria-current='page'] {
    background: var(--bg);
    font-weight: 600;
    box-shadow: inset 3px 0 var(--accent);
  }
  .pad {
    margin: 0;
    padding: 10px 14px;
  }
  .file {
    overflow: hidden;
    min-width: 0;
  }
  header {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
    padding: 9px 14px;
    border-bottom: 1px solid var(--line);
  }
  .code {
    font: 13px/1.6 var(--mono);
    overflow-x: auto;
    padding: 6px 0;
  }
  .row {
    display: grid;
    grid-template-columns: 44px 5px 1fr;
    gap: 0 8px;
    width: 100%;
    min-width: max-content;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    white-space: pre;
    cursor: pointer;
  }
  .row:hover,
  .row.asked {
    background: var(--wash, var(--bg));
  }
  .row.dim {
    opacity: 0.4;
  }
  .row:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .number {
    text-align: right;
    color: var(--faint);
    user-select: none;
  }
  .stripe {
    background: var(--stripe, transparent);
    border-radius: 2px;
  }
  .side {
    display: grid;
    gap: 12px;
  }
  .box {
    padding: 12px 14px;
    display: grid;
    gap: 6px;
  }
  .box p {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .faint,
  .small {
    font-size: 13px;
  }
  .reason {
    display: grid;
    grid-template-columns: 5px 1fr;
    gap: 8px;
    padding: 4px 6px 4px 0;
    border-radius: 4px;
    cursor: pointer;
  }
  .reason:hover {
    background: var(--hover);
  }
  .reason[aria-pressed='true'] {
    background: var(--bg);
  }
  .reason .faint {
    display: block;
  }
  .why2 {
    font-size: 13px;
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .error {
    margin: 10px;
  }
</style>
