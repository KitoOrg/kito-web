<script>
  // What stands between a lane and where it lands, one thing a line.
  let { rows } = $props();

  const word = { ok: 'passes', warn: 'to look at', bad: 'stops it' };
</script>

<ul class="panel checks">
  {#each rows as row (row.name)}
    <li>
      <span class={`ring ${row.tone || 'none'}`} aria-hidden="true"></span>
      <div>
        <p class="name">
          {row.name}
          {#if row.tone}<span class={`chip ${row.tone}`}>{word[row.tone]}</span>{/if}
        </p>
        <p class="soft text">{row.text}</p>
        {#if row.commands}
          <ul class="commands">
            {#each row.commands as command}<li class="mono">{command}</li>{/each}
          </ul>
        {/if}
      </div>
    </li>
  {/each}
</ul>
<p class="faint note">
  What the checks of the repository say of this lane is known when it asks to go in: the answer is shown where it was
  asked, beside this.
</p>

<style>
  .checks {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .checks > li {
    display: flex;
    gap: 12px;
    padding: 12px 16px;
  }
  .checks > li + li {
    border-top: 1px solid var(--line);
  }
  .ring.none {
    border-color: var(--line);
  }
  .name {
    margin: 0;
    font-weight: 600;
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .text {
    margin: 2px 0 0;
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .commands {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }
  .note {
    margin: 10px 2px 0;
    font-size: 13px;
  }
</style>
