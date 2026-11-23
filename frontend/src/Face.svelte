<script>
  // Who said or did something: a person by an initial, an agent by the
  // mark of the assistant it runs in when the lane says it, or by its
  // first letters. `small`: in a line of facts, where a full face would
  // make the line taller.
  import Assistant from './Assistant.svelte';

  let { name = '', agent = false, assistant = null, small = false } = $props();
</script>

{#if agent && assistant?.name}
  <Assistant {assistant} big={!small} />
{:else}
  <span class="face" class:agent class:little={small} aria-hidden="true">{name.slice(0, agent ? 2 : 1)}</span>
{/if}

<style>
  .face {
    display: inline-grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-ink);
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    text-transform: uppercase;
    flex: none;
  }
  .face.little {
    width: 20px;
    height: 20px;
  }
  .face.agent {
    border-radius: var(--radius);
    background: var(--done-bg);
    color: var(--done);
    text-transform: none;
  }
</style>
