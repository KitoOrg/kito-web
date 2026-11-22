<script>
  // Why the code a lane changes is the way it is: for each function or
  // file it touched, the reasons before this one, who else is on it now,
  // and the notes left on it. What a reviewer would have to go and find.
  import { ago, ask, laneLink, whyLink } from './api.js';
  import Empty from './Empty.svelte';
  import Loading from './Loading.svelte';

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

  const who = (reason) => (reason.for ? `${reason.by} for ${reason.for}` : reason.by);
  // The reasons of this lane itself are what is being reviewed: said, and set apart.
  const own = (reason) => reason.lane === id && !reason.checkpoint;
  const others = (graph) => (graph.in_progress ?? []).filter((other) => other.lane !== id);
</script>

{#if failed}<p class="error">{failed}</p>{/if}
{#if targets.length === 0}
  <Empty title="This lane has changed nothing yet." />
{/if}
{#each targets.slice(0, SHOWN) as one (one.target)}
  {@const graph = graphs[one.target]}
  <section class="panel">
    <header>
      <span class="chip">{one.kind}</span>
      <a class="mono name" href={whyLink(one.target, lane)}>{one.target}</a>
      <span class="faint">{one.change}</span>
    </header>
    {#if !graph}
      <Loading lines={2} inset />
    {:else if graph.error}
      <p class="soft pad">{graph.error}</p>
    {:else}
      <ul class="reasons">
        {#each (graph.reasons ?? []).slice(0, 5) as reason}
          <li class:own={own(reason)}>
            <span class="why">“{reason.why}”</span>
            <span class="faint">
              {who(reason)} · {reason.checkpoint ?? reason.lane ?? ''}{#if reason.at_ms}&nbsp;· {ago(reason.at_ms)}{/if}
            </span>
            {#if own(reason)}<span class="chip">this lane</span>{/if}
          </li>
        {/each}
        {#if (graph.reasons ?? []).length === 0}<li class="soft">No reason is recorded for it yet.</li>{/if}
      </ul>
      {#each others(graph) as other}
        <p class="also">
          <span class="chip warn">now</span>
          <a href={laneLink(other.lane)}>{other.lane}</a>
          ({other.agent}{#if other.for}&nbsp;for {other.for}{/if}) {other.how}{#if other.intent}: “{other.intent}”{/if}
        </p>
      {/each}
      {#each graph.annotations ?? [] as note}
        <p class="also"><span class="chip">note</span> {note.text} <span class="faint">{note.by}</span></p>
      {/each}
    {/if}
  </section>
{/each}
{#if targets.length > SHOWN}
  <p class="faint more">And {targets.length - SHOWN} more: each is linked from the changes.</p>
{/if}

<style>
  section + section {
    margin-top: 12px;
  }
  header {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    padding: 10px 14px;
    border-bottom: 1px solid var(--line);
  }
  .name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .pad {
    margin: 0;
    padding: 10px 14px;
  }
  .reasons {
    list-style: none;
    margin: 0;
    padding: 6px 14px;
    display: grid;
    gap: 6px;
  }
  .reasons li {
    display: flex;
    gap: 8px;
    align-items: baseline;
    flex-wrap: wrap;
    padding-left: 10px;
    border-left: 3px solid var(--line);
    font-size: 13px;
  }
  .reasons li.own {
    border-color: var(--accent);
  }
  .why {
    overflow-wrap: anywhere;
  }
  .faint {
    font-size: 13px;
  }
  .also {
    margin: 0;
    padding: 8px 14px;
    border-top: 1px solid var(--line);
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .more {
    margin: 10px 2px 0;
  }
</style>
