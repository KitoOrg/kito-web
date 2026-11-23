<script>
  // Why one change was made, where the change is shown (Kito 0.42): the
  // reason its lane gave, or that it has none yet. Whoever may write in
  // the open lane says why in place, or says it again.
  import { ask, focus } from './api.js';
  import { NO_REASON } from './standing.js';
  import Err from './Err.svelte';
  import State from './State.svelte';
  import { toast } from './toast.svelte.js';

  // `on`: the function (`src/shop.ts:total`) or the file; `why`: its
  // reason; `unexplained`: it has none yet; `may`: the reader may say it;
  // `changed`: reads the lane again.
  let { lane, on, why = null, unexplained = false, may = false, changed = null } = $props();

  // What is typed while it is written; null: it is not.
  let writing = $state(null);
  let busy = $state(false);
  let failed = $state('');
  // The reason just saved, shown until the lane is read again.
  let given = $state(null);
  $effect(() => {
    void why;
    void unexplained;
    given = null;
  });
  let said = $derived(given ?? why);

  function start() {
    writing = said ?? '';
    failed = '';
  }

  async function save(event) {
    event.preventDefault();
    const text = writing.trim();
    busy = true;
    failed = '';
    try {
      await ask('explain', { lane, reasons: [{ on, why: text }] });
      given = text;
      writing = null;
      toast('Reason saved');
      await changed?.();
    } catch (error) {
      failed = error.message;
    } finally {
      busy = false;
    }
  }
</script>

{#if writing !== null}
  <div class="writing">
    <form class="controls" onsubmit={save}>
      <input
        class="sm"
        bind:value={writing}
        maxlength="500"
        aria-label={`Why ${on}`}
        placeholder="Rounded once, at the end: rounding each line lost cents"
        use:focus
        onkeydown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          writing = null;
        }}
      />
      <button class="primary sm" disabled={busy || writing.trim() === '' || writing.trim() === (said ?? '')}>
        {busy ? 'Saving…' : 'Save'}
      </button>
      <button type="button" class="quiet sm" disabled={busy} onclick={() => (writing = null)}>Cancel</button>
    </form>
    <Err message={failed} />
  </div>
{:else if said}
  <q class="reason">{said}</q>
  {#if may}<button class="quiet sm again later" aria-label={`Edit the reason of ${on}`} onclick={start}>Edit</button>{/if}
{:else if unexplained}
  <State said={NO_REASON} />
  {#if may}<button class="quiet sm again" onclick={start}>Say why</button>{/if}
{/if}

<style>
  /* Written on a line of its own, under what it is the reason of. */
  .writing {
    flex-basis: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
    padding-block: 4px;
  }
  .writing input {
    flex: 1 1 240px;
  }
  /* Taller than the line it is on: it reaches past it, and the line stays as it is. */
  .again {
    margin-block: -4px;
  }
  /* Changing a reason given is there when the line is pointed at, or reached by keyboard. */
  .later {
    opacity: 0;
  }
  :global(:hover) > .later,
  .later:focus-visible {
    opacity: 1;
  }
  @media (hover: none) {
    .later {
      opacity: 1;
    }
  }
</style>
