<script>
  // Why the code a lane changes is the way it is: for each function or
  // file it touched, the reasons before this one, who else is on it now,
  // and the notes left on it. What a reviewer would have to go and find.
  import { ask, laneLink, whyLink } from './api.js';
  import { laneName, who } from './format.js';
  import Empty from './Empty.svelte';
  import Err from './Err.svelte';
  import Loading from './Loading.svelte';
  import Time from './Time.svelte';

  // `targets`: what the lane changed, as `{ target, kind, change }`.
  let { lane, id, targets } = $props();

  // Asked of the repository for the first of them: a lane that touched
  // a hundred functions is not read here.
  const SHOWN = 12;
  let graphs = $state({});
  let failed = $state('');

  $effect(() => {
    const wanted = targets.slice(0, SHOWN).map((one) => one.target);
    let stopped = false;
    Promise.all(
      wanted.map((target) =>
        ask('why_graph', { target, lane }).then(
          (graph) => [target, graph],
          (error) => [target, { error: error.message }],
        ),
      ),
    ).then(
      (found) => !stopped && (graphs = Object.fromEntries(found)),
      (error) => (failed = error.message),
    );
    return () => (stopped = true);
  });

  // The reasons of this lane itself are what is being reviewed: said, and set apart.
  const own = (reason) => reason.lane === id && !reason.checkpoint;
  const others = (graph) => (graph.in_progress ?? []).filter((other) => other.lane !== id);
</script>

<Err message={failed} />
{#if targets.length === 0}
  <Empty title="No changes yet">The reasons behind the code this lane changes show here.</Empty>
{/if}
{#each targets.slice(0, SHOWN) as one (one.target)}
  {@const graph = graphs[one.target]}
  <section class="panel">
    <div class="panel-head">
      <h3 class="mono"><a href={whyLink(one.target, lane)}>{one.target}</a></h3>
      <span class="tag">{one.kind}, {one.change}</span>
    </div>
    {#if !graph}
      <Loading lines={2} inset />
    {:else if graph.error}
      <div class="pad"><Err message={graph.error} /></div>
    {:else}
      {#if (graph.reasons ?? []).length === 0}
        <Empty title="No reason recorded yet" inset />
      {:else}
        <ul class="reasons">
          {#each graph.reasons.slice(0, 5) as reason}
            <li class:own={own(reason)}>
              <q class="reason">{reason.why}</q>
              <span class="small faint">
                {who(reason.by, reason.for)}
                {#if reason.checkpoint}
                  · <span class="ref">{reason.checkpoint}</span>
                {:else if own(reason)}
                  · this lane
                {:else if reason.lane}
                  · <a class="ref" href={laneLink(reason.lane)}>{laneName(reason.lane)}</a>
                {/if}
                {#if reason.at_ms}· <Time ms={reason.at_ms} />{/if}
              </span>
            </li>
          {/each}
        </ul>
      {/if}
      {#each others(graph) as other}
        <p class="also">
          <span class="tag">on it now</span>
          <a class="ref" href={laneLink(other.lane)}>{laneName(other.lane)}</a>
          ({who(other.agent, other.for)}) {other.how}{#if other.intent}: <q class="reason">{other.intent}</q>{/if}
        </p>
      {/each}
      {#each graph.annotations ?? [] as note}
        <p class="also">
          <span class="tag">note</span>
          <span class="said">{note.text}</span>
          <span class="small faint">{who(note.by, note.for)}</span>
        </p>
      {/each}
    {/if}
  </section>
{/each}
{#if targets.length > SHOWN}
  <p class="footnote">
    And {targets.length - SHOWN} more: each is linked from the <a href={`${laneLink(lane)}?tab=changes`}>Changes</a>.
  </p>
{/if}

<style>
  .reasons {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 12px var(--pad-panel);
    list-style: none;
  }
  /* Each reason hangs on a line; those of this lane, on one of its own colour. */
  .reasons li {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 8px;
    align-items: baseline;
    padding-left: 8px;
    border-left: 3px solid var(--line);
    overflow-wrap: anywhere;
  }
  .reasons li.own {
    border-color: var(--accent);
  }
  .also {
    padding: 8px var(--pad-panel);
    border-top: 1px solid var(--line);
    overflow-wrap: anywhere;
  }
</style>
