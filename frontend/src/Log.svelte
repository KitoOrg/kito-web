<script>
  // What was recorded on the main lane, newest first: checkpoints, and
  // the changes each holds.
  import { ask, ago, watch, whyLink } from './api.js';
  import Empty from './Empty.svelte';
  import Loading from './Loading.svelte';

  let entries = $state(null);
  let failed = $state('');
  let limit = $state(200);

  async function load() {
    try {
      entries = await ask('log', { limit });
      failed = '';
    } catch (error) {
      failed = error.message;
    }
  }

  $effect(() => {
    limit;
    load();
  });
  $effect(() => watch((events) => events.some((event) => ['integrated', 'checkpoint', 'saved'].includes(event.kind)) && load()));

  // Each checkpoint with the changes under it; what is in none yet comes first.
  let groups = $derived.by(() => {
    const groups = [];
    let current = { checkpoint: null, ops: [] };
    for (const entry of entries ?? []) {
      if (entry.type === 'checkpoint') {
        if (current.checkpoint || current.ops.length > 0) groups.push(current);
        current = { checkpoint: entry, ops: [] };
      } else {
        current.ops.push(entry);
      }
    }
    if (current.checkpoint || current.ops.length > 0) groups.push(current);
    return groups;
  });

  const what = (op) => op.detail ?? `${op.op.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()} ${op.path ?? ''}`;
  const target = (op) => (op.symbol && op.path ? `${op.path}:${op.symbol}` : op.path);
</script>

<div class="page-head">
  <div>
    <h1>Log</h1>
    <p class="lead">What is on the main lane, newest first: each checkpoint, and the changes it holds.</p>
  </div>
</div>

{#if failed}
  <p class="error">{failed}</p>
{:else if entries === null}
  <Loading lines={5} />
{:else if groups.length === 0}
  <Empty title="Nothing is recorded yet.">Each checkpoint of the main lane, and what it holds, shows here.</Empty>
{:else}
  {#each groups as group}
    <section class="panel">
      <header>
        {#if group.checkpoint}
          <span class="mono id">{group.checkpoint.id}</span>
          <h2>{group.checkpoint.label}</h2>
          <span class="soft">by {group.checkpoint.author}</span>
          {#if group.checkpoint.git_commit}
            <span class="faint mono" title="The git commit it was exported as">git {group.checkpoint.git_commit.slice(0, 10)}</span>
          {/if}
        {:else}
          <h2>In no checkpoint yet</h2>
          <span class="soft">saved on the main lane since the last one</span>
        {/if}
      </header>
      {#if group.ops.length > 0}
        <ul>
          {#each group.ops as op (op.id)}
            <li>
              <span class="what">
                {#if target(op)}<a href={whyLink(target(op))}>{what(op)}</a>{:else}{what(op)}{/if}
                {#if op.lines_added !== null || op.lines_removed !== null}
                  <span class="plus">+{op.lines_added ?? 0}</span> <span class="minus">−{op.lines_removed ?? 0}</span>
                {/if}
              </span>
              {#if op.intent}<span class="intent">“{op.intent}”</span>{/if}
              <span class="faint who">{op.author} · {ago(op.at_ms)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/each}
  {#if entries.length >= limit}
    <p><button onclick={() => (limit += 400)}>Show older</button></p>
  {/if}
{/if}

<style>
  section {
    margin-bottom: 12px;
    overflow: hidden;
  }
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 10px;
    padding: 10px 16px;
    font-size: 13px;
  }
  .id {
    color: var(--soft);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 8px 16px 12px;
    border-top: 1px solid var(--line);
    display: grid;
    gap: 4px;
    font-size: 13px;
  }
  li {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: baseline;
  }
  .what {
    overflow-wrap: anywhere;
  }
  .intent {
    color: var(--soft);
    font-style: italic;
  }
  .who {
    margin-left: auto;
    font-size: 13px;
    white-space: nowrap;
  }
  .plus {
    color: var(--added-ink);
    font-family: var(--mono);
    font-size: 12px;
  }
  .minus {
    color: var(--removed-ink);
    font-family: var(--mono);
    font-size: 12px;
  }
</style>
