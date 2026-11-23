<script>
  // Why a function or some lines are the way they are: the reasons, which
  // lines each wrote, who uses it, who is on it now, and the notes left
  // on it.
  import { ask, fileText, focus, laneLink, mayWrite, whyLink } from './api.js';
  import { laneName, sentence, who } from './format.js';
  import { toast } from './toast.svelte.js';
  import Confirm from './Confirm.svelte';
  import Err from './Err.svelte';
  import Loading from './Loading.svelte';
  import PageHead from './PageHead.svelte';
  import Time from './Time.svelte';

  // `role`: what the reader may do in this repository, behind a server.
  let { target, lane = null, role = undefined } = $props();
  const may = $derived(mayWrite(role));

  let graph = $state(null);
  let text = $state(null);
  let failed = $state('');
  // The reason whose lines are pointed out.
  let picked = $state(null);

  let noting = $state(false);
  let note = $state('');
  let busy = $state(false);
  let noteFailed = $state('');

  async function load() {
    try {
      const params = { target };
      if (lane) params.lane = lane;
      const answer = await ask('why_graph', params);
      graph = answer;
      failed = '';
      text = answer.target?.file ? await fileText(answer.target.file, lane) : null;
    } catch (error) {
      failed = error.message;
    }
  }
  load();

  let code = $derived(text === null ? [] : text.split('\n'));
  // Each of its lines, with the reason it was last written for: none
  // (null) for a line older than what the history tells.
  let rows = $derived(
    (graph?.lines ?? []).flatMap((run) =>
      Array.from({ length: run.to - run.from + 1 }, (_, i) => ({ line: run.from + i, reason: run.reason ?? null })),
    ),
  );

  let name = $derived(
    graph === null ? target : graph.target.name ? `${graph.target.file}:${graph.target.name}` : (graph.target.file ?? target),
  );
  // For the browser's tab: without the directories it is in.
  let short = $derived(name.slice(name.lastIndexOf('/') + 1));

  // What a reason went through before it was integrated, in a line.
  const passed = (reason) =>
    sentence(
      [
        reason.checks?.length > 0 && `checks passed: ${reason.checks.join('; ')}`,
        reason.reviewed_by?.length > 0 && `reviewed by ${reason.reviewed_by.join(', ')}`,
        reason.approved_by && `integrated by ${reason.approved_by}`,
      ]
        .filter(Boolean)
        .join(' · '),
    );

  // Does it, says so, and reads the page again; false when it could not.
  async function act(what, done) {
    busy = true;
    noteFailed = '';
    try {
      await what();
      toast(done);
      await load();
      return true;
    } catch (error) {
      noteFailed = error.message;
      return false;
    } finally {
      busy = false;
    }
  }
  async function add(event) {
    event.preventDefault();
    const params = lane ? { on: target, text: note, lane } : { on: target, text: note };
    if (!(await act(() => ask('add_note', params), 'Note added'))) return;
    note = '';
    noting = false;
  }
  const remove = (id) => act(() => ask('remove_note', { note: id }), 'Note removed');
</script>

{#snippet facts()}
  {sentence(graph.target.kind ?? '')}{#if graph.target.lines}&nbsp;· lines {graph.target.lines[0]}–{graph.target.lines[1]}{/if}{#if lane}&nbsp;· as
    <a class="ref" href={laneLink(lane)}>{laneName(lane)}</a> has it{/if}{#if graph.target.name}&nbsp;· in
    <a class="ref" href={whyLink(graph.target.file, lane)}>{graph.target.file}</a>{/if}
{/snippet}

<PageHead title={name} mono name={short} back={{ href: '#/code', label: 'Code' }} docs="code-and-why" lead={graph ? facts : null} />

{#if graph === null}
  {#if failed}<Err message={failed} />{:else}<Loading lines={4} />{/if}
{:else}
  <Err message={failed} />

  <div class="cols why">
    <div class="stack">
      <section class="panel pad box">
        <h3>Why it is the way it is</h3>
        {#if graph.reasons.length === 0}
          <p class="none">None yet</p>
        {:else}
          <ol class="reasons">
            {#each graph.reasons as reason, index}
              <li class={`hue-${index % 6}`}>
                <button
                  class="bare swatch"
                  aria-label={`Point out the lines written for: ${reason.why}`}
                  aria-pressed={picked === index}
                  onclick={() => (picked = picked === index ? null : index)}><span class="mono">{index + 1}</span></button
                >
                <div class="row-body">
                  <span class="row-title"><q class="reason">{reason.why}</q></span>
                  <!-- A reason given for this change (Kito 0.42): what its lane was for, under it. -->
                  {#if reason.explained && reason.intent}<span class="row-meta"><q class="reason">{reason.intent}</q></span>{/if}
                  <span class="row-meta">
                    {who(reason.by, reason.for)}{#if reason.how?.length > 0}&nbsp;· {reason.how.join(', ')}{/if}{#if reason.lane}&nbsp;· <a class="ref" href={laneLink(reason.lane)}>{laneName(reason.lane)}</a>{/if}
                    · {#if reason.checkpoint}<span class="ref">{reason.checkpoint}</span>{:else}not integrated yet{/if}
                    · <Time ms={reason.at_ms} />
                  </span>
                  {#if passed(reason)}<span class="row-meta">{passed(reason)}</span>{/if}
                  {#if reason.with?.length > 0}
                    <span class="row-meta">
                      With {#each reason.with as other, at}{at > 0 ? ', ' : ''}<a class="ref" href={whyLink(other, lane)}>{other}</a>{/each}
                    </span>
                  {/if}
                </div>
              </li>
            {/each}
          </ol>
        {/if}
      </section>

      {#if rows.length > 0 && text !== null}
        <section class="panel pad box">
          <h3>Its lines, and the reason each was last written for</h3>
          <div class="code" role="table" aria-label="Lines and their reasons">
            {#each rows as row (row.line)}
              <div
                class={['line', row.reason !== null && `hue-${row.reason % 6}`, picked !== null && picked !== row.reason && 'dim']}
                role="row"
              >
                <span class="by" role="cell">{row.reason === null ? '' : row.reason + 1}</span>
                <span class="number" role="cell">{row.line}</span>
                <span role="cell">{code[row.line - 1] ?? ''}</span>
              </div>
            {/each}
          </div>
        </section>
      {/if}
    </div>

    <aside class="stack">
      <section class="panel pad box">
        <h3>Notes</h3>
        {#each graph.annotations ?? [] as said (said.id)}
          <article class="note">
            <p class="said">{said.text}</p>
            <div class="controls">
              <span class="grow small soft">
                {who(said.by, said.for)} · on <span class="ref">{said.on}</span> · <Time ms={said.at_ms} />
              </span>
              {#if may}
                <Confirm
                  label="Remove"
                  ask="Remove this note? Whoever changes this code is no longer told it."
                  working="Removing…"
                  onyes={() => remove(said.id)}
                  disabled={busy}
                  sm
                />
              {/if}
            </div>
          </article>
        {:else}
          <p class="none">None yet</p>
        {/each}
        {#if noting}
          <form class="box" onsubmit={add}>
            <label class="field">
              <span>Note</span>
              <textarea bind:value={note} placeholder="Called by the nightly billing job, outside this repository: do not rename." use:focus></textarea>
            </label>
            <div class="controls">
              <button class="primary" disabled={busy || note.trim() === ''}>{busy ? 'Adding…' : 'Add'}</button>
              <button type="button" class="quiet" onclick={() => (noting = false)}>Cancel</button>
            </div>
          </form>
        {:else if may}
          <div><button class="sm" onclick={() => (noting = true)}>Add note</button></div>
        {/if}
        <Err message={noteFailed} />
      </section>

      {#if graph.in_progress?.length > 0}
        <section class="panel pad box">
          <h3>On it now</h3>
          {#each graph.in_progress as work}
            <p>
              <a class="ref" href={laneLink(work.lane)}>{laneName(work.lane)}</a> · {who(work.agent, work.for)}
              {#if work.intent}<br /><q class="reason">{work.intent}</q>{/if}
              {#if work.how}<br /><span class="small faint">{work.how}</span>{/if}
            </p>
          {/each}
        </section>
      {/if}

      {#each [['Used by', graph.used_by], ['Uses', graph.uses], ['It contains', graph.contains]] as [title, items]}
        {#if items?.length > 0}
          <section class="panel pad box">
            <h3>{title}</h3>
            {#each items as item}
              <p>
                <a class="ref" href={whyLink(item.symbol, lane)}>{item.symbol}</a>
                {#if item.line}<span class="small faint">line {item.line}</span>{/if}
                {#if item.last}<br /><q class="reason">{item.last.why}</q>{/if}
              </p>
            {/each}
          </section>
        {/if}
      {/each}

      {#if graph.decisions?.length > 0}
        <section class="panel pad box">
          <h3>Decided on it</h3>
          {#each graph.decisions as decision}
            <p>
              <span class="mono">{decision.conflict}</span> · {decision.kind.replaceAll('_', ' ')}
              <br /><span class="soft"
                >{decision.decided ? `Decided: ${decision.decided}${decision.applied ? ', applied' : ''}` : 'To decide'}</span
              >
            </p>
          {/each}
        </section>
      {/if}
    </aside>
  </div>
{/if}

<style>
  /* Both columns can be narrow: a long word breaks. */
  .why {
    overflow-wrap: anywhere;
  }
  .reasons {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 12px;
  }
  .reasons li {
    display: grid;
    grid-template-columns: var(--control-sm) minmax(0, 1fr);
    gap: 12px;
    align-items: start;
  }
  /* The number of a reason, in the colour its lines have: pressed, it points them out. */
  .swatch {
    display: grid;
    place-items: center;
    width: var(--control-sm);
    height: var(--control-sm);
    border: 1px solid var(--hue);
    border-radius: var(--radius);
    background: color-mix(in srgb, var(--hue) 14%, transparent);
  }
  .swatch[aria-pressed='true'] {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  /* A line: the number of its reason, its own number, its text, in the
     colour of the reason. */
  .line {
    display: grid;
    grid-template-columns: 28px 44px 1fr;
    gap: 0 8px;
    min-width: max-content;
    border-left: 3px solid var(--hue, transparent);
    background: color-mix(in srgb, var(--hue, transparent) 14%, transparent);
    white-space: pre;
  }
  .line.dim {
    opacity: 0.35;
  }
  .by {
    text-align: center;
    font-weight: 500;
    user-select: none;
  }
  .number {
    text-align: right;
    color: var(--faint);
    user-select: none;
  }
  .note {
    display: grid;
    gap: 4px;
  }
  .note + .note {
    padding-top: 8px;
    border-top: 1px solid var(--line);
  }
</style>
