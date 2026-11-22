<script>
  // Who said or did something: a person by an initial, an agent by the
  // mark of the assistant it runs in when the lane says it, or by its
  // first letters.
  import Assistant from './Assistant.svelte';

  let { name = '', agent = false, assistant = null } = $props();
</script>

{#if agent && assistant?.name}
  <Assistant {assistant} big />
{:else}
  <span class="face" class:agent aria-hidden="true">{name.slice(0, agent ? 2 : 1)}</span>
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
  .face.agent {
    border-radius: var(--radius);
    background: var(--done-bg);
    color: var(--done);
    text-transform: none;
  }
</style>
