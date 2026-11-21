<script>
  // What a lane and its target did to the same code and does not
  // compose: each is decided, and the next integration applies it.
  import { ask } from './api.js';

  let { conflicts, target = 'main', changed } = $props();

  // The text being written for a conflict, by its ID.
  let writing = $state({});
  let busy = $state(false);
  let failed = $state('');

  async function decide(conflict, decision) {
    busy = true;
    failed = '';
    try {
      await ask('resolve_conflict', { conflict: conflict.id, ...decision });
      delete writing[conflict.id];
      await changed();
    } catch (error) {
      failed = error.message;
    } finally {
      busy = false;
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
      main: `keep ${target}'s`,
      lane: "keep the lane's",
      text: 'a text written for it',
      rewrite: 'rewrite the uses',
      keep: 'keep the uses',
    })[resolution] ?? resolution;
</script>

<section class="panel" aria-label="Conflicts">
  <header>
    <h2>{conflicts.length === 1 ? 'A conflict to decide' : `${conflicts.length} conflicts to decide`}</h2>
    <span class="soft small">Each decision is applied by the next integration.</span>
  </header>
  {#each conflicts as conflict (conflict.id)}
    <article>
      <p class="head">
        <span class="mono id">{conflict.id}</span>
        <span class="mono">{where(conflict)}</span>
        <span class="soft">{kinds[conflict.kind] ?? conflict.kind.replaceAll('_', ' ')}</span>
        {#if conflict.resolution}<span class="chip ok">decided: {said(conflict.resolution)}</span>{/if}
      </p>
      <div class="sides">
        <div>
          <h3>On {target}</h3>
          <pre>{conflict.main ?? '(it is not there)'}</pre>
        </div>
        <div>
          <h3>In the lane</h3>
          <pre>{conflict.lane_text ?? '(it is not there)'}</pre>
        </div>
      </div>
      {#if conflict.base !== null}
        <details>
          <summary class="soft small">What both started from</summary>
          <pre>{conflict.base}</pre>
        </details>
      {/if}
      {#if writing[conflict.id] !== undefined}
        <textarea bind:value={writing[conflict.id]} aria-label={`The text for ${conflict.id}`} spellcheck="false"></textarea>
        <div class="actions">
          <button class="primary" disabled={busy} onclick={() => decide(conflict, { text: writing[conflict.id] })}>Use this text</button>
          <button onclick={() => delete writing[conflict.id]}>Cancel</button>
        </div>
      {:else}
        <div class="actions">
          {#if renamed(conflict)}
            <button disabled={busy} onclick={() => decide(conflict, { choice: 'rewrite' })}>Rewrite the uses</button>
            <button disabled={busy} onclick={() => decide(conflict, { choice: 'keep' })}>Keep them as they are</button>
          {:else}
            <button disabled={busy} onclick={() => decide(conflict, { choice: 'main' })}>Keep {target}'s</button>
            <button disabled={busy} onclick={() => decide(conflict, { choice: 'lane' })}>Keep the lane's</button>
            <button disabled={busy} onclick={() => (writing[conflict.id] = conflict.lane_text ?? conflict.main ?? '')}>Write the text</button>
          {/if}
        </div>
      {/if}
    </article>
  {/each}
  {#if failed}<p class="error">{failed}</p>{/if}
</section>

<style>
  section {
    border-color: var(--bad);
  }
  header {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: baseline;
    padding: 12px 16px;
  }
  .small {
    font-size: 13px;
  }
  article {
    padding: 12px 16px;
    border-top: 1px solid var(--line);
  }
  .head {
    margin: 0 0 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: baseline;
    font-size: 14px;
  }
  .id {
    color: var(--soft);
  }
  .sides {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  @media (max-width: 700px) {
    .sides {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  h3 {
    font-size: 12px;
    color: var(--soft);
    font-weight: 600;
    margin-bottom: 4px;
  }
  pre {
    margin: 0;
    padding: 8px 10px;
    border-radius: 6px;
    background: var(--bg);
    font: 12px/1.5 var(--mono);
    overflow-x: auto;
    max-height: 320px;
  }
  details {
    margin-top: 8px;
  }
  details pre {
    margin-top: 4px;
  }
  textarea {
    margin-top: 10px;
    min-height: 140px;
    font: 12px/1.5 var(--mono);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
  }
  .error {
    margin: 12px 16px;
  }
</style>
