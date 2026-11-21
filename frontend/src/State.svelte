<script>
  // Where a lane stands, in a few words: its state, and its review.
  import { standing } from './standing.js';

  let { lane } = $props();

  let said = $derived(standing(lane));
</script>

<span class={`chip ${said.tone}`}>{said.text}</span>
