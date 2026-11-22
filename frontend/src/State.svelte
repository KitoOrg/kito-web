<script>
  // Where a thing stands, in a few words: a lane (`lane`), a task (`task`),
  // or anything a page already asked `standing.js` about (`said`: `{ text,
  // tone }`). A chip, wherever it is the only sign of the state. `plain`:
  // in a row that starts with a ring of the same tone, the words alone.
  import { standing, taskStanding } from './standing.js';

  let { lane = null, task = null, said = null, plain = false } = $props();

  let now = $derived(said ?? (lane ? standing(lane) : task ? taskStanding(task) : { text: '', tone: '' }));
</script>

{#if now.text}
  {#if plain}<span class="tag">{now.text}</span>{:else}<span class={['chip', now.tone]}>{now.text}</span>{/if}
{/if}
