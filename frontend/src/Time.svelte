<script>
  // When something happened: how long ago, with the moment itself for
  // whoever points at it. `never`: what to say when it did not.
  import { ago, exact } from './format.js';

  let { ms = 0, never = 'never' } = $props();
</script>

{#if ms}<time datetime={new Date(ms).toISOString()} title={exact(ms)}>{ago(ms)}</time>{:else}<span class="none">{never}</span>{/if}
