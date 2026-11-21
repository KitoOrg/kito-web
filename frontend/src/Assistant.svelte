<script>
  // Which assistant the agent of a lane runs in, and on what model: a
  // mark of two letters, with its name and model beside it when there is
  // room. It is what the assistant's side said of itself (Kito's ADR
  // 0010): nothing is shown for a lane nobody said anything of.
  import { assistantOf } from './assistants.js';

  // `words`: the name and the model are written out, not only the mark.
  // `big`: the mark stands where a face would.
  let { assistant = null, words = false, big = false } = $props();

  let known = $derived(assistant?.name ? assistantOf(assistant) : null);
</script>

{#if known}
  <span class="assistant" title={known.title}>
    <span class={`mark ${known.colour}`} class:big aria-hidden="true">{known.letters}</span>
    {#if words}
      <span class="words">{known.label}{#if assistant.model}&nbsp;· <span class="mono">{assistant.model}</span>{/if}</span>
    {:else}
      <span class="sr">{known.title}</span>
    {/if}
  </span>
{/if}

<style>
  .assistant {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    vertical-align: middle;
  }
  .mark {
    display: inline-grid;
    place-items: center;
    width: 20px;
    height: 18px;
    border-radius: 5px;
    border: 1px solid var(--line);
    background: var(--bg);
    color: var(--soft);
    font: 700 10px/1 var(--sans);
    letter-spacing: 0.01em;
    flex: none;
  }
  .mark.big {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    font-size: 11px;
  }
  .mark.amber {
    background: var(--warn-bg);
    color: var(--warn);
    border-color: transparent;
  }
  .mark.green {
    background: var(--ok-bg);
    color: var(--ok);
    border-color: transparent;
  }
  .mark.violet {
    background: var(--done-bg);
    color: var(--done);
    border-color: transparent;
  }
  .mark.blue {
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    color: var(--accent);
    border-color: transparent;
  }
  .words {
    color: var(--soft);
    font-size: 13px;
  }
</style>
