<script>
  // Why a function, a file or some lines are the way they are: the
  // reasons, which lines each wrote, who uses it, who is on it now, and
  // the notes left on it.
  import { ask, ago, fileText, focus, laneLink, whyLink } from './api.js';

  let { target, lane = null } = $props();

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
  // Each line that has a reason, with it.
  let rows = $derived(
    (graph?.lines ?? []).flatMap((run) =>
      Array.from({ length: run.to - run.from + 1 }, (_, i) => ({ line: run.from + i, reason: run.reason })),
    ),
  );
  const tint = (reason) => `hsl(${(reason * 67 + 205) % 360} 60% 50% / 0.16)`;
  const edge = (reason) => `hsl(${(reason * 67 + 205) % 360} 55% 50%)`;

  let name = $derived(
    graph === null ? target : graph.target.name ? `${graph.target.file}:${graph.target.name}` : (graph.target.file ?? target),
  );

  async function act(what) {
    busy = true;
    noteFailed = '';
    try {
      await what();
      note = '';
      noting = false;
      await load();
    } catch (error) {
      noteFailed = error.message;
    } finally {
      busy = false;
    }
  }
  const leave = () => act(() => ask('add_note', lane ? { on: target, text: note, lane } : { on: target, text: note }));
  const remove = (id) => act(() => ask('remove_note', { note: id }));
</script>

<p class="back"><a href="#/why">← Why</a></p>

{#if failed && graph === null}
  <p class="error">{failed}</p>
{:else if graph === null}
  <p class="soft">…</p>
{:else}
  <div class="top">
    <h1 class="mono">{name}</h1>
    <p class="soft meta">
      {graph.target.kind}
      {#if graph.target.lines}· lines {graph.target.lines[0]}–{graph.target.lines[1]}{/if}
      {#if lane}· as <a href={laneLink(lane)}>{lane.startsWith('lane/') || isNaN(lane) ? lane : `lane/${lane}`}</a> has it{/if}
      {#if graph.target.name}· in <a class="mono" href={whyLink(graph.target.file, lane)}>{graph.target.file}</a>{/if}
    </p>
  </div>
  {#if failed}<p class="error">{failed}</p>{/if}

  <div class="columns">
    <div class="main">
      <section class="panel">
        <h2>Why it is the way it is</h2>
        {#if graph.reasons.length === 0}
          <p class="soft none">No reason is recorded for it.</p>
        {/if}
        <ol>
          {#each graph.reasons as reason, index}
            <li class:picked={picked === index}>
              <button
                class="swatch"
                style={`background:${tint(index)};border-color:${edge(index)}`}
                title="Point out the lines it wrote"
                aria-label={`Point out the lines written for: ${reason.why}`}
                aria-pressed={picked === index}
                onclick={() => (picked = picked === index ? null : index)}>{index + 1}</button
              >
              <div>
                <p class="why">{reason.why}</p>
                <p class="soft small">
                  {reason.how?.join(', ')} · by {reason.by}{#if reason.for}, for {reason.for}{/if}
                  {#if reason.lane}· <a href={laneLink(reason.lane)}>{reason.lane}</a>{/if}
                  {#if reason.checkpoint}· {reason.checkpoint}{:else}· not integrated yet{/if}
                  · {ago(reason.at_ms)}
                </p>
                {#if reason.checks?.length > 0 || reason.reviewed_by?.length > 0 || reason.approved_by}
                  <p class="soft small">
                    {#if reason.checks?.length > 0}checks passed: {reason.checks.join('; ')}{/if}
                    {#if reason.reviewed_by?.length > 0}· reviewed by {reason.reviewed_by.join(', ')}{/if}
                    {#if reason.approved_by}· let in by {reason.approved_by}{/if}
                  </p>
                {/if}
                {#if reason.with?.length > 0}
                  <p class="with small">
                    <span class="faint">with</span>
                    {#each reason.with as other}
                      <a class="mono" href={whyLink(other, lane)}>{other}</a>
                    {/each}
                  </p>
                {/if}
              </div>
            </li>
          {/each}
        </ol>
      </section>

      {#if rows.length > 0 && text !== null}
        <section class="panel lines">
          <h2>Its lines, and the reason each was last written for</h2>
          <div class="code" role="table" aria-label="Lines and their reasons">
            {#each rows as row (row.line)}
              <div
                class="row"
                class:dim={picked !== null && picked !== row.reason}
                style={`background:${tint(row.reason)}`}
                role="row"
              >
                <span class="reason" style={`color:${edge(row.reason)}`}>{row.reason + 1}</span>
                <span class="number">{row.line}</span>
                <span class="text">{code[row.line - 1] ?? ''}</span>
              </div>
            {/each}
          </div>
        </section>
      {/if}
    </div>

    <aside>
      <section class="panel side">
        <h2>Notes</h2>
        {#each graph.annotations ?? [] as said (said.id)}
          <article class="note">
            <p>{said.text}</p>
            <p class="soft small">
              {said.by}{#if said.for}, of {said.for}{/if} · on <span class="mono">{said.on}</span> · {ago(said.at_ms)}
              <button class="quiet" disabled={busy} onclick={() => remove(said.id)}>Remove</button>
            </p>
          </article>
        {:else}
          <p class="soft small">Nothing to know about it that no change says.</p>
        {/each}
        {#if noting}
          <form
            onsubmit={(event) => {
              event.preventDefault();
              leave();
            }}
          >
            <textarea
              bind:value={note}
              placeholder="What whoever changes this must know, and the code does not show"
              aria-label="A note on this code"
              use:focus
            ></textarea>
            <div class="actions">
              <button class="primary" disabled={busy || note.trim().length < 3}>Leave the note</button>
              <button type="button" onclick={() => (noting = false)}>Cancel</button>
            </div>
          </form>
        {:else}
          <div class="actions"><button onclick={() => (noting = true)}>Leave a note</button></div>
        {/if}
        {#if noteFailed}<p class="error">{noteFailed}</p>{/if}
      </section>

      {#if graph.in_progress?.length > 0}
        <section class="panel side">
          <h2>On it now</h2>
          {#each graph.in_progress as work}
            <p class="small">
              <a href={laneLink(work.lane)}>{work.lane}</a> · {work.agent}{#if work.for}, for {work.for}{/if}
              <br /><span class="soft">{work.intent ?? ''}</span>
              <br /><span class="faint">{work.how}</span>
            </p>
          {/each}
        </section>
      {/if}

      {#each [['Used by', graph.used_by], ['Uses', graph.uses], ['It contains', graph.contains]] as [title, items]}
        {#if items?.length > 0}
          <section class="panel side">
            <h2>{title}</h2>
            {#each items as item}
              <p class="small">
                <a class="mono" href={whyLink(item.symbol, lane)}>{item.symbol}</a>
                {#if item.line}<span class="faint">line {item.line}</span>{/if}
                {#if item.last}<br /><span class="soft">“{item.last.why}”</span>{/if}
              </p>
            {/each}
          </section>
        {/if}
      {/each}

      {#if graph.decisions?.length > 0}
        <section class="panel side">
          <h2>Decided on it</h2>
          {#each graph.decisions as decision}
            <p class="small">
              <span class="mono">{decision.conflict}</span> · {decision.kind.replaceAll('_', ' ')}
              <br /><span class="soft"
                >{decision.decided ? `decided: ${decision.decided}${decision.applied ? ', applied' : ''}` : 'to decide'}</span
              >
            </p>
          {/each}
        </section>
      {/if}
    </aside>
  </div>
{/if}

<style>
  .back {
    margin: 0 0 12px;
    font-size: 14px;
  }
  .top {
    margin-bottom: 16px;
  }
  h1 {
    font-size: 20px;
    overflow-wrap: anywhere;
  }
  .meta {
    margin: 4px 0 0;
    font-size: 14px;
  }
  .columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 20px;
    align-items: start;
  }
  @media (max-width: 900px) {
    .columns {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .main,
  aside {
    display: grid;
    gap: 14px;
    min-width: 0;
  }
  section {
    padding: 14px 16px;
  }
  .none {
    margin: 8px 0 0;
  }
  ol {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
    display: grid;
    gap: 12px;
  }
  li {
    display: grid;
    grid-template-columns: 30px 1fr;
    gap: 10px;
    align-items: start;
  }
  .swatch {
    width: 28px;
    height: 28px;
    padding: 0;
    border-radius: 6px;
    font-family: var(--mono);
    font-size: 13px;
  }
  li.picked .swatch {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .why {
    margin: 0;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .small {
    margin: 2px 0 0;
    font-size: 13px;
  }
  .with {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 12px;
  }
  .lines {
    padding: 14px 0 0;
    overflow: hidden;
  }
  .lines h2 {
    padding: 0 16px 10px;
  }
  .code {
    font: 13px/1.55 var(--mono);
    overflow-x: auto;
    border-top: 1px solid var(--line);
  }
  .row {
    display: grid;
    grid-template-columns: 34px 44px 1fr;
    white-space: pre;
    min-width: max-content;
  }
  .row.dim {
    opacity: 0.35;
  }
  .reason {
    text-align: center;
    font-weight: 700;
    user-select: none;
  }
  .number {
    text-align: right;
    padding-right: 10px;
    color: var(--faint);
    user-select: none;
  }
  .text {
    padding-right: 16px;
  }
  .side {
    display: grid;
    gap: 8px;
  }
  .note p {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .note + .note {
    padding-top: 8px;
    border-top: 1px solid var(--line);
  }
  .side p {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .actions {
    display: flex;
    gap: 6px;
    margin-top: 6px;
  }
  textarea {
    min-height: 70px;
  }
</style>
