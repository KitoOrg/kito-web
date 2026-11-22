<script>
  // What stands between a lane and the lane it is integrated into, one
  // thing a line: how it stands, what it is, and a sentence on it.
  import { CHECK_WORDS } from './standing.js';

  let { rows } = $props();
</script>

<ul class="panel rows">
  {#each rows as row (row.name)}
    <li>
      <div class="row">
        <span class={['ring', row.tone]} aria-hidden="true"></span>
        <div class="row-body">
          <span class="row-title">{row.name}<span class="sr">, {CHECK_WORDS[row.tone]}</span></span>
          <span class="soft">{row.text}</span>
          {#if row.items}
            <ul class="items">
              {#each row.items as item}<li class="mono">{item}</li>{/each}
            </ul>
          {/if}
        </div>
      </div>
    </li>
  {/each}
</ul>
<p class="footnote">Check commands run when the lane asks to be integrated.</p>

<style>
  .items {
    display: grid;
    gap: 2px;
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
    overflow-wrap: anywhere;
  }
</style>
