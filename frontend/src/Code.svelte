<script>
  // The code, a directory at a time (Kito 0.41): what it holds, each entry
  // with the last checkpoint that changed it, and its README under them.
  // A file with an edge on each line in the colour of the reason it was
  // last written for, and at its side what that reason was. As the main
  // lane has it now, as a lane has it, or as it was at a checkpoint (the
  // text alone: reasons are known for the present). A Kito without `tree`
  // has its directories made here from its list of files, now only.
  // Earlier work is found by the words of its reason.
  import { ask, blobText, checkpointLink, codeLink, fileText, historyLink, lacked, lacks, laneLink, whyLink } from './api.js';
  import { count, laneName, who } from './format.js';
  import { markdown } from './md.js';
  import { shell } from './shell.svelte.js';
  import Empty from './Empty.svelte';
  import Err from './Err.svelte';
  import Icon from './Icon.svelte';
  import Loading from './Loading.svelte';
  import PageHead from './PageHead.svelte';
  import Time from './Time.svelte';

  // `path`: a file or a directory ('' the root); `dir`: the address says
  // it is a directory. `at`: a checkpoint (`ckpt#4`) it is shown as it was
  // at. `lane`: as that lane has it, instead of the main lane.
  let { path = '', dir = false, at = null, lane = null } = $props();

  // A past checkpoint; else the lane it is read in, if any.
  let past = $derived(Boolean(at?.startsWith('ckpt#')));
  let inLane = $derived(lane ? laneName(lane) : at && !past && at !== 'main' ? at : null);
  let point = $derived(past ? at : inLane);

  let older = $state(lacked('tree'));
  // What is shown: `dir`, `file`, or `none` (nothing there).
  let kind = $state(null);
  let listing = $state(null);
  // The file's entry in its directory: its content's ID and its last change.
  let entry = $state(null);
  let readme = $state(null);
  let failed = $state('');

  let graph = $state(null);
  let text = $state(null);
  // The line that is asked about, and the reason whose lines are pointed out.
  let line = $state(null);
  let shown = $state(null);

  // The words typed, what was found for the words last searched, and those words.
  let words = $state('');
  let found = $state(null);
  let searched = $state('');
  let searching = $state(false);
  let searchFailed = $state('');

  const parentOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
  const nameOf = (p) => p.slice(p.lastIndexOf('/') + 1);
  const within = (name) => (path ? `${path}/${name}` : name);
  function treeOf(p) {
    const params = point ? { at: point } : {};
    if (p) params.path = p;
    return ask('tree', params);
  }
  // Addresses that stay at the same point.
  const here = (p, isDir) => codeLink(p, { at: past ? at : null, lane: inLane, dir: isDir });

  async function look() {
    try {
      if (!older) {
        try {
          await fromTree();
          return;
        } catch (error) {
          if (!lacks(error, 'tree')) throw error;
          older = true;
        }
      }
      await fromFiles();
    } catch (error) {
      failed = error.message;
    }
  }
  look();

  async function fromTree() {
    if (path === '' || dir) return showDir(await treeOf(path));
    const above = await treeOf(parentOf(path));
    const named = above.entries.find((one) => one.name === nameOf(path));
    if (!named) kind = 'none';
    else if (named.kind === 'dir') await showDir(await treeOf(path));
    else await showFile(named);
  }

  // Before 0.41: the directories are made of the list of files.
  async function fromFiles() {
    const listed = await ask('lane_files', inLane ? { lane: inLane } : {});
    const files = listed.files ?? [];
    const exact = files.find((one) => one.path === path);
    if (exact && !dir) return showFile({ name: nameOf(path), kind: 'file', blob: exact.blob });
    const start = path ? `${path}/` : '';
    const dirs = new Set();
    const plain = [];
    for (const one of files) {
      if (!one.path.startsWith(start)) continue;
      const rest = one.path.slice(start.length);
      const cut = rest.indexOf('/');
      if (cut < 0) plain.push({ name: rest, kind: 'file', blob: one.blob });
      else dirs.add(rest.slice(0, cut));
    }
    if (path && dirs.size === 0 && plain.length === 0) {
      kind = 'none';
      return;
    }
    const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
    const entries = [...[...dirs].sort(byName).map((name) => ({ name, kind: 'dir' })), ...plain.sort((a, b) => byName(a.name, b.name))];
    await showDir({ path, entries, readme: plain.find((one) => /^readme(\.md|\.markdown|\.txt)?$/i.test(one.name))?.name });
  }

  async function showDir(said) {
    listing = said;
    kind = 'dir';
    const named = said.readme ? said.entries.find((one) => one.name === said.readme) : null;
    if (named?.blob) readme = { name: named.name, text: await blobText(named.blob) };
  }

  async function showFile(it) {
    entry = it;
    if (past) {
      text = it.blob ? await blobText(it.blob) : null;
    } else {
      [graph, text] = await Promise.all([
        ask('why_graph', inLane ? { target: path, lane: inLane } : { target: path }),
        it.blob ? blobText(it.blob) : fileText(path, inLane),
      ]);
    }
    kind = 'file';
  }

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

  // The directories the path goes through, each with its own address.
  let crumbs = $derived(
    path
      .split('/')
      .filter(Boolean)
      .map((name, n, all) => ({ name, path: all.slice(0, n + 1).join('/') })),
  );
  let rendered = $derived(readme && readme.text !== null && /\.(md|markdown)$/i.test(readme.name));

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

<!-- A checkpoint: a link to its page where the server has pages of checkpoints. -->
{#snippet checkpoint(id)}{#if older}<span class="ref">{id}</span>{:else}<a class="ref" href={checkpointLink(id)}>{id}</a>{/if}{/snippet}

{#snippet finder()}
  <form
    class="finder"
    role="search"
    onsubmit={(event) => {
      event.preventDefault();
      search();
    }}
  >
    <input class="sm" type="search" bind:value={words} placeholder="Words of a reason" aria-label="Words of a reason" />
    <button class="sm" disabled={searching || words.trim() === ''}>{searching ? 'Searching…' : 'Search'}</button>
  </form>
{/snippet}

<PageHead title="Code" name={path ? nameOf(path) : 'Code'} docs="code" actions={finder} />

<Err message={searchFailed} />
{#if found !== null}
  <section class="panel found" aria-label="What the search found">
    <div class="panel-head">
      <h3>Reasons with <q>{searched}</q></h3>
      {#if found.length > 0}<span class="count">{found.length}</span>{/if}
      <span class="grow"></span>
      <button class="quiet sm icon" aria-label="Close" onclick={() => (found = null)}><Icon name="close" /></button>
    </div>
    {#if found.length === 0}
      <Empty inset title="No reason has those words" />
    {:else}
      <ul class="rows">
        {#each found as hit}
          <li>
            <div class="row">
              <div class="row-body">
                <span class="row-title"><q class="reason">{hit.why}</q></span>
                <span class="row-meta">
                  {who(hit.by.join(', '), hit.for)}{#if hit.lane}&nbsp;· <a class="ref" href={laneLink(hit.lane)}>{laneName(hit.lane)}</a>{/if}{#if hit.checkpoint}&nbsp;· {@render checkpoint(hit.checkpoint)}{/if}
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

<div class="where">
  <h2 class="crumbs">
    {#if crumbs.length === 0}<span aria-current="page">{shell.repo ?? 'root'}</span>{:else}<a href={here('', true)}>{shell.repo ?? 'root'}</a>{/if}
    {#each crumbs as crumb, n (crumb.path)}
      <span class="faint" aria-hidden="true">/</span>
      {#if n === crumbs.length - 1}<span aria-current="page">{crumb.name}</span>{:else}<a href={here(crumb.path, true)}>{crumb.name}</a>{/if}
    {/each}
  </h2>
  {#if past}
    <span class="small soft">at {@render checkpoint(at)} · <a href={codeLink(path, { dir: kind === 'dir' })}>Back to now</a></span>
  {:else if inLane}
    <span class="small soft">as <a class="ref" href={laneLink(inLane)}>{inLane}</a> has it</span>
  {/if}
  <span class="grow"></span>
  {#if path && !older}<a class="button sm" href={historyLink(path)}>History</a>{/if}
</div>

{#if failed}
  <Err message={failed} />
{:else if kind === null}
  <Loading lines={6} />
{:else if kind === 'none'}
  <Empty title="Not found" />
{:else if kind === 'dir'}
  <div class="stack">
    <div class="panel table-wrap">
      <table class="tree">
        <thead>
          <tr>
            <th class="name">Name</th>
            {#if !older}
              <th>Last change</th>
              <th class="by">By</th>
              <th class="when"><span class="sr">When</span></th>
            {/if}
          </tr>
        </thead>
        <tbody>
          {#each listing.entries as one (one.name)}
            <tr>
              <td class="name">
                <span class="entry">
                  <span class={['kind', one.kind]}><Icon name={one.kind === 'dir' ? 'folder' : 'file'} /></span>
                  <a href={here(within(one.name), one.kind === 'dir')}>{one.name}</a>
                </span>
              </td>
              {#if !older}
                <td>
                  {#if one.last}<a class="why" href={checkpointLink(one.last.checkpoint)}>{one.last.why}</a>{/if}
                </td>
                <td class="by soft">{one.last?.by ?? ''}</td>
                <td class="when soft">{#if one.last?.at_ms}<Time ms={one.last.at_ms} />{/if}</td>
              {/if}
            </tr>
          {:else}
            <tr>
              <td colspan={older ? 1 : 4}><Empty inset title="No files yet" /></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#if readme}
      <section class="panel">
        <div class="panel-head"><h3 class="mono">{readme.name}</h3></div>
        {#if readme.text === null}
          <Empty inset title="No text to show" />
        {:else if rendered}
          <div class="pad rendered">{@html markdown(readme.text)}</div>
        {:else}
          <div class="pad"><pre>{readme.text}</pre></div>
        {/if}
      </section>
    {/if}
  </div>
{:else}
  {#snippet file()}
    <section class="panel">
      <div class="panel-head">
        {#if entry.last}
          <span class="small soft lastline">
            <a class="why" href={checkpointLink(entry.last.checkpoint)}>{entry.last.why}</a>
            · {entry.last.by}{#if entry.last.at_ms}&nbsp;· <Time ms={entry.last.at_ms} />{/if}
          </span>
        {/if}
        <span class="grow"></span>
        <span class="small soft">
          {count(code.length, 'line')}{#if !past}&nbsp;· {count(reasons.length, 'reason')}{/if}{#if notes.length > 0}&nbsp;· {count(notes.length, 'note')}{/if}
        </span>
      </div>
      {#if text === null}
        <Empty inset title="No text to show" />
      {:else if past}
        <div class="pad">
          <div class="code" role="group" aria-label={`The lines of ${path}`}>
            {#each code as content, index}
              <div class="line"><span class="number">{index + 1}</span><span>{content}</span></div>
            {/each}
          </div>
        </div>
      {:else}
        <div class="pad">
          <div class="code" role="group" aria-label={`The lines of ${path}: press one to read its reason`}>
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
  {/snippet}

  {#if past}
    {@render file()}
  {:else}
    <div class="cols">
      {@render file()}

      <aside class="stack side">
        {#if line !== null}
          <section class="panel pad box">
            <h3>Why line {line}</h3>
            {#if asked}
              {@const inFunction = inside(line)}
              <p><q class="reason">{asked.why}</q></p>
              <p class="small soft">
                {who(asked.by, asked.for)}{#if asked.how?.length > 0}&nbsp;· {asked.how.join(', ')}{/if}{#if asked.lane}&nbsp;· <a class="ref" href={laneLink(asked.lane)}>{laneName(asked.lane)}</a>{/if}
                · {#if asked.checkpoint}{@render checkpoint(asked.checkpoint)}{:else}not integrated yet{/if}
                · <Time ms={asked.at_ms} />
              </p>
              {#if asked.reviewed_by?.length > 0}<p class="small soft">Reviewed by {asked.reviewed_by.join(', ')}</p>{/if}
              {#if inFunction}
                <p class="small">In <a class="ref" href={whyLink(inFunction.symbol, inLane)}>{called(inFunction.symbol)}</a>: all of its reasons</p>
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
              class={['bare', 'reason-of', `hue-${index % 6}`]}
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
                <a class="ref" href={whyLink(item.symbol, inLane)}>{called(item.symbol)}</a>
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
{/if}

<style>
  /* The search, at the head of the page: as wide as a few words. */
  .finder {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .finder input {
    width: 220px;
  }
  /* What a search found stands over the code, until it is closed. */
  .found {
    margin-bottom: var(--gap);
  }
  /* Where one is: the path, each directory a link; beside it, at what point. */
  .where {
    display: flex;
    align-items: baseline;
    gap: 4px 12px;
    flex-wrap: wrap;
    margin-bottom: var(--gap);
  }
  .crumbs {
    display: flex;
    flex-wrap: wrap;
    gap: 0 6px;
    min-width: 0;
    font-family: var(--mono);
    overflow-wrap: anywhere;
  }
  .crumbs a {
    font-weight: 500;
  }
  /* A directory: names, then the last change, who, and when, each cut short on one line. */
  .tree {
    table-layout: fixed;
  }
  .tree th.name {
    width: 34%;
  }
  .tree th.by {
    width: 140px;
  }
  .tree th.when {
    width: 128px;
  }
  .tree td {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .when {
    text-align: right;
  }
  .entry {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .entry a {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .kind {
    display: inline-flex;
    color: var(--faint);
  }
  .kind.dir {
    color: var(--accent);
  }
  /* The reason of a last change: a link, read before it is pressed. */
  .why {
    color: var(--soft);
  }
  .why:hover {
    color: var(--accent);
  }
  .lastline {
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
  button.line:hover,
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
  .reason-of {
    display: block;
    width: 100%;
    padding: 4px 8px;
    border-left: 3px solid var(--hue);
  }
  .reason-of:hover {
    background: var(--hover);
  }
  .reason-of[aria-pressed='true'] {
    background: color-mix(in srgb, var(--hue) 14%, transparent);
  }
  @media (max-width: 640px) {
    .tree th.name {
      width: 50%;
    }
    .tree th.when {
      width: 96px;
    }
    .by {
      display: none;
    }
  }
</style>
