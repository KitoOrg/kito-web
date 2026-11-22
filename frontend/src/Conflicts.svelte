<script>
  // What a lane and its target did to the same code and does not
  // compose: each is decided, and the next integration applies it.
  import { ask } from './api.js';
  import Err from './Err.svelte';
  import { toast } from './toast.svelte.js';

  // `mayWrite`: a reader sees what does not compose, and decides nothing.
  let { conflicts, target = 'main', changed, mayWrite = true } = $props();

  // The text being written for a conflict, by its ID.
  let writing = $state({});
  // The decision being sent, while it is: the conflict and the button's words.
  let busy = $state('');
  // What went wrong, and for which conflict.
  let failed = $state({ on: null, why: '' });

  async function decide(conflict, decision, key) {
    busy = key;
    failed = { on: null, why: '' };
    try {
      await ask('resolve_conflict', { conflict: conflict.id, ...decision });
      delete writing[conflict.id];
      toast(`${conflict.id} decided`);
      await changed();
    } catch (error) {
      failed = { on: conflict.id, why: error.message };
    } finally {
      busy = '';
    }
  }

  const kinds = {
    body_body: 'both changed it',
    remove_modify: 'one removed it, the other changed it',
    rename_rename: 'both renamed it',
    semantic_ref: 'renamed on one side, still used by its old name on the other',
    text: 'both changed the same lines',
  };
  const where = (conflict) => (conflict.symbol ? `${conflict.file}:${conflict.symbol}` : (conflict.file ?? ''));
  // Uses of a renamed symbol are rewritten or kept; anything else is one side or the other.
  const renamed = (conflict) => conflict.kind === 'semantic_ref';
  const said = (resolution) =>
    ({
      main: `keep ${target}’s`,
      lane: 'keep the lane’s',
      text: 'a text written for it',
      rewrite: 'rewrite the uses',
      keep: 'keep the uses',
    })[resolution] ?? resolution;
</script>

<!-- One way to decide a conflict: `decision` is asked for when it is pressed. -->
{#snippet choice(conflict, label, decision, primary = false)}
  {@const key = `${conflict.id} ${label}`}
  <button class={[primary && 'primary']} disabled={busy !== ''} onclick={() => decide(conflict, decision(), key)}>
    {busy === key ? 'Deciding…' : label}
  </button>
{/snippet}

<section class="stack">
  <div>
    <h2 class="section-title">Conflicts <span class="count">{conflicts.length}</span></h2>
  </div>
  {#each conflicts as conflict (conflict.id)}
    <article class="panel">
      <div class="panel-head">
        <h3 class="mono">{where(conflict) || conflict.id}</h3>
        <span class="small soft">{kinds[conflict.kind] ?? conflict.kind.replaceAll('_', ' ')}</span>
        <span class="grow"></span>
        {#if conflict.resolution}
          <span class="chip ok">decided</span>
          <span class="small soft">{said(conflict.resolution)}</span>
        {/if}
        {#if where(conflict)}<span class="ref">{conflict.id}</span>{/if}
      </div>
      <div class="pad body">
        <div class="sides">
          <div class="side">
            <h4>On {target}</h4>
            <pre>{conflict.main ?? '(it is not there)'}</pre>
          </div>
          <div class="side">
            <h4>In the lane</h4>
            <pre>{conflict.lane_text ?? '(it is not there)'}</pre>
          </div>
        </div>
        {#if conflict.base !== null}
          <details>
            <summary>What both started from</summary>
            <pre>{conflict.base}</pre>
          </details>
        {/if}
        {#if !mayWrite}
          <p class="hint">Whoever may write in this repository decides it.</p>
        {:else if writing[conflict.id] !== undefined}
          <label class="field">
            <span>The text to use</span>
            <textarea class="mono written" bind:value={writing[conflict.id]} wrap="off" spellcheck="false"></textarea>
          </label>
          <div class="controls">
            {@render choice(conflict, 'Use this text', () => ({ text: writing[conflict.id] }), true)}
            <button class="quiet" onclick={() => delete writing[conflict.id]}>Cancel</button>
          </div>
        {:else}
          <div class="controls">
            {#if renamed(conflict)}
              {@render choice(conflict, 'Rewrite the uses', () => ({ choice: 'rewrite' }))}
              {@render choice(conflict, 'Keep them as they are', () => ({ choice: 'keep' }))}
            {:else}
              {@render choice(conflict, `Keep ${target}’s`, () => ({ choice: 'main' }))}
              {@render choice(conflict, 'Keep the lane’s', () => ({ choice: 'lane' }))}
              <button disabled={busy !== ''} onclick={() => (writing[conflict.id] = conflict.lane_text ?? conflict.main ?? '')}>
                Write the text
              </button>
            {/if}
          </div>
        {/if}
        {#if failed.on === conflict.id}<Err message={failed.why} />{/if}
      </div>
    </article>
  {/each}
</section>

<style>
  /* One column that never grows past the panel: a long text scrolls
     inside its own box. */
  .body,
  .side {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
  }
  .body {
    gap: 8px;
  }
  .side {
    gap: 4px;
  }
  .sides {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  pre {
    max-height: 320px;
  }
  .written {
    min-height: 140px;
  }
  @media (max-width: 640px) {
    .sides {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
