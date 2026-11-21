<script>
  // What a lane did to one file: its functions, its lines, and what was
  // said on them.
  import { ask, focus } from './api.js';
  import Thread from './Thread.svelte';

  let { lane, file, threads, changed } = $props();

  // The line a comment is being written on (its number in the lane's text).
  let writing = $state(null);
  let text = $state('');
  let busy = $state(false);
  let failed = $state('');

  // Every line of every hunk, with where it is on each side.
  let hunks = $derived(
    file.hunks?.map((hunk) => {
      let [before, after] = [hunk.before[0], hunk.after[0]];
      // A side with no lines is said to be after the line before it.
      if (hunk.before[1] === 0) before += 1;
      if (hunk.after[1] === 0) after += 1;
      const rows = hunk.lines.map((line) => {
        const mark = line[0];
        const row = { mark, text: line.slice(1), old: null, now: null };
        if (mark !== '+') row.old = before++;
        if (mark !== '-') row.now = after++;
        return row;
      });
      return { head: `@@ -${hunk.before[0]},${hunk.before[1]} +${hunk.after[0]},${hunk.after[1]} @@`, rows };
    }) ?? [],
  );

  // On their lines, where the diff shows them; else above the lines.
  let shown = $derived(new Set(hunks.flatMap((hunk) => hunk.rows.map((row) => row.now).filter((n) => n !== null))));
  let inline = $derived(threads.filter((thread) => thread.comment.lines && !thread.comment.outdated && shown.has(thread.comment.lines[1])));
  let above = $derived(threads.filter((thread) => !inline.includes(thread)));
  const on = (line) => inline.filter((thread) => thread.comment.lines[1] === line);

  async function comment() {
    busy = true;
    failed = '';
    try {
      await ask('comment', { lane, text, on: `${file.path}:${writing}` });
      text = '';
      writing = null;
      await changed();
    } catch (error) {
      failed = error.message;
    } finally {
      busy = false;
    }
  }

  const where = (symbol) => {
    if (!symbol.lines) return '';
    return symbol.lines[0] === symbol.lines[1] ? `line ${symbol.lines[0]}` : `lines ${symbol.lines[0]}–${symbol.lines[1]}`;
  };
  const name = (symbol) => symbol.symbol.slice(symbol.symbol.lastIndexOf(':') + 1);
</script>

<section class="panel file" id={`file-${file.path}`}>
  <header>
    <span class={`chip ${file.change === 'removed' ? 'bad' : file.change === 'added' ? 'ok' : ''}`}>{file.change}</span>
    <h2 class="mono">{file.path}</h2>
    {#if file.was}<span class="soft">was <span class="mono">{file.was}</span></span>{/if}
    <span class="grow"></span>
    {#if file.binary}
      <span class="soft">binary</span>
    {:else}
      <span class="plus">+{file.added}</span>
      <span class="minus">−{file.removed}</span>
    {/if}
  </header>

  {#if file.symbols?.length > 0}
    <ul class="symbols">
      {#each file.symbols as symbol (symbol.symbol)}
        <li>
          <span class="change">{symbol.change}</span>
          <span class="mono">{name(symbol)}</span>
          <span class="faint">{where(symbol)}</span>
          {#if symbol.was}<span class="soft">was <span class="mono">{symbol.was}</span></span>{/if}
          {#each symbol.intents ?? [] as intent}
            <span class="intent">“{intent}”</span>
          {/each}
        </li>
      {/each}
    </ul>
  {/if}

  {#if above.length > 0}
    <div class="above">
      {#each above as thread (thread.comment.id)}
        <p class="about soft">On <span class="mono">{thread.comment.on}</span></p>
        <Thread {lane} comment={thread.comment} answers={thread.answers} {changed} />
      {/each}
    </div>
  {/if}

  {#if hunks.length > 0}
    <div class="lines" role="table" aria-label={`Changes to ${file.path}`}>
      {#each hunks as hunk}
        <div class="hunk mono">{hunk.head}</div>
        {#each hunk.rows as row}
          <div class={`row ${row.mark === '+' ? 'added' : row.mark === '-' ? 'removed' : ''}`} role="row">
            <span class="number">{row.old ?? ''}</span>
            <span class="number">{row.now ?? ''}</span>
            <span class="say">
              {#if row.now !== null}
                <button
                  class="add"
                  title={`Comment on line ${row.now}`}
                  aria-label={`Comment on line ${row.now} of ${file.path}`}
                  onclick={() => {
                    writing = row.now;
                    text = '';
                  }}>+</button
                >
              {/if}
            </span>
            <span class="mark">{row.mark === ' ' ? '' : row.mark === '-' ? '−' : '+'}</span>
            <span class="code">{row.text}</span>
          </div>
          {#if row.now !== null}
            {#each on(row.now) as thread (thread.comment.id)}
              <div class="between">
                <Thread {lane} comment={thread.comment} answers={thread.answers} {changed} />
              </div>
            {/each}
            {#if writing === row.now}
              <form
                class="between"
                onsubmit={(event) => {
                  event.preventDefault();
                  comment();
                }}
              >
                <textarea
                  bind:value={text}
                  placeholder={`What is there to say about line ${row.now}? The agent in the lane is told.`}
                  aria-label={`Comment on line ${row.now}`}
                  use:focus
                ></textarea>
                <div class="actions">
                  <button class="primary" disabled={busy || text.trim().length < 2}>Comment</button>
                  <button type="button" onclick={() => (writing = null)}>Cancel</button>
                </div>
                {#if failed}<p class="error">{failed}</p>{/if}
              </form>
            {/if}
          {/if}
        {/each}
      {/each}
    </div>
  {:else if !file.binary && file.change === 'renamed'}
    <p class="note soft">Renamed, with what is in it unchanged.</p>
  {/if}
</section>

<style>
  .file {
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--line);
    flex-wrap: wrap;
  }
  h2 {
    font-size: 14px;
    overflow-wrap: anywhere;
  }
  .grow {
    flex: 1;
  }
  .plus {
    color: var(--added-ink);
    font-family: var(--mono);
    font-size: 13px;
  }
  .minus {
    color: var(--removed-ink);
    font-family: var(--mono);
    font-size: 13px;
  }
  .symbols {
    list-style: none;
    margin: 0;
    padding: 8px 14px;
    border-bottom: 1px solid var(--line);
    display: grid;
    gap: 2px;
    font-size: 13px;
  }
  .symbols li {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: baseline;
  }
  .change {
    min-width: 62px;
    color: var(--soft);
  }
  .intent {
    color: var(--soft);
    font-style: italic;
  }
  .above {
    padding: 10px 14px;
    border-bottom: 1px solid var(--line);
    display: grid;
    gap: 6px;
  }
  .about {
    margin: 4px 0 0;
    font-size: 13px;
  }
  .lines {
    font: 13px/1.55 var(--mono);
    overflow-x: auto;
  }
  .hunk {
    padding: 2px 14px;
    background: var(--bg);
    color: var(--faint);
    font-size: 12px;
  }
  .row {
    display: grid;
    grid-template-columns: 44px 44px 22px 16px 1fr;
    white-space: pre;
    min-width: max-content;
  }
  .row.added {
    background: var(--added);
  }
  .row.removed {
    background: var(--removed);
  }
  .number {
    text-align: right;
    padding-right: 8px;
    color: var(--faint);
    user-select: none;
  }
  .mark {
    user-select: none;
    color: var(--soft);
  }
  .row.added .mark {
    color: var(--added-ink);
  }
  .row.removed .mark {
    color: var(--removed-ink);
  }
  .code {
    padding-right: 14px;
  }
  .add {
    width: 18px;
    height: 18px;
    padding: 0;
    line-height: 1;
    font-size: 13px;
    border-radius: 4px;
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-ink);
    opacity: 0;
  }
  .row:hover .add,
  .add:focus-visible {
    opacity: 1;
  }
  .between {
    padding: 8px 14px 8px 110px;
    background: var(--bg);
    border-block: 1px solid var(--line);
    white-space: normal;
    font-family: var(--sans);
  }
  .actions {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }
  .note {
    margin: 0;
    padding: 10px 14px;
    font-size: 13px;
  }
  .error {
    margin: 8px 0 0;
  }
</style>
