<script>
  // What was recorded on the main lane, newest first: checkpoints, and
  // the changes each holds. History, where the server lists no
  // checkpoints of their own.
  import { ask, watch, whyLink } from './api.js';
  import { humanize, opName } from './format.js';
  import Empty from './Empty.svelte';
  import Err from './Err.svelte';
  import Loading from './Loading.svelte';
  import PageHead from './PageHead.svelte';
  import Time from './Time.svelte';

  let entries = $state(null);
  let failed = $state('');
  let limit = $state(200);
  // Older entries were asked for, and are not here yet.
  let more = $state(false);

  async function load() {
    try {
      entries = await ask('log', { limit });
      failed = '';
    } catch (error) {
      failed = error.message;
    }
    more = false;
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

  // What a change did. Of a function the daemon says it in a sentence of its
  // own; of a file there is its kind, in words (`TextEdit`: text edit), and
  // at times a word more (where it was renamed from, that it is binary).
  const kind = (op) => opName(op.op);
  const target = (op) => (op.symbol && op.path ? `${op.path}:${op.symbol}` : op.path);
</script>

<!-- What History is on a Kito that lists no checkpoints (before 0.41). -->
<PageHead title="History" docs="history" />

{#if failed}
  <Err message={failed} />
{:else if entries === null}
  <Loading lines={5} />
{:else if groups.length === 0}
  <Empty title="Nothing recorded yet" />
{:else}
  <div class="stack">
    {#each groups as group}
      <section class="panel group">
        <div class={['panel-head', 'group-head', group.ops.length === 0 && 'alone']}>
          {#if group.checkpoint}
            <h3>{group.checkpoint.label}</h3>
            <span class="soft small">
              <span class="ref">{group.checkpoint.id}</span> · by {group.checkpoint.author}
              {#if group.checkpoint.git_commit}· exported to git as <span class="mono">{group.checkpoint.git_commit.slice(0, 10)}</span>{/if}
            </span>
          {:else}
            <h3>In no checkpoint yet</h3>
            <span class="soft small">saved on the main lane since the last one</span>
          {/if}
        </div>
        {#if group.ops.length > 0}
          <ul class="rows">
            {#each group.ops as op (op.id)}
              <li>
                <div class="row">
                  <div class="row-body">
                    <div class="change">
                      {#if !(op.symbol_id && op.detail)}
                        {kind(op)}{#if target(op)}{' '}<a class="ref" href={whyLink(target(op))}>{target(op)}</a>{/if}{#if op.detail}, {humanize(op.detail)}{/if}
                      {:else if target(op)}
                        <a href={whyLink(target(op))}>{humanize(op.detail)}</a>
                      {:else}
                        {humanize(op.detail)}
                      {/if}
                      {#if op.lines_added !== null || op.lines_removed !== null}
                        <span class="plus">+{op.lines_added ?? 0}</span> <span class="minus">−{op.lines_removed ?? 0}</span>
                      {/if}
                      <!-- Why this change, when its lane said so (Kito 0.42); else what the lane was for. -->
                      {#if op.reason ?? op.intent}<q class="reason">{op.reason ?? op.intent}</q>{/if}
                    </div>
                  </div>
                  <span class="row-side"><span class="row-meta">{op.author} · <Time ms={op.at_ms} /></span></span>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/each}
  </div>
  {#if entries.length >= limit}
    <p class="older">
      <button disabled={more} onclick={() => ((more = true), (limit += 400))}>{more ? 'Loading…' : 'Show older'}</button>
    </p>
  {/if}
{/if}

<style>
  /* A checkpoint's facts go under its label when there is no room beside it. */
  .group-head {
    flex-wrap: wrap;
  }
  /* One that holds no change shown here has nothing under it to rule off. */
  .group > .alone {
    border-bottom: 0;
  }
  /* A long path breaks where it must, and stays in its row. */
  .change {
    overflow-wrap: anywhere;
  }
  .older {
    margin-top: var(--gap);
  }
</style>
