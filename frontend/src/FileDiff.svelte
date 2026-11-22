<script>
  // What a lane did to one file: its functions, its lines, and what was
  // said on them.
  import { focus, whyLink } from './api.js';
  import { markViewed, viewedAs } from './review.js';
  import Thread from './Thread.svelte';

  // `drafts`: the comments of the review being written, on this file;
  // `draft`, `undraft`: add one, take one out (Kito 0.38).
  let { lane, file, threads, changed, drafts = [], draft = null, undraft = null, mayWrite = true } = $props();

  // The line a comment is being written on (its number in the lane's text).
  let writing = $state(null);
  let text = $state('');
  // Lines suggested in the place of the one commented on; null: none.
  let suggestion = $state(null);
  let failed = $state('');

  // Viewed: folded, until the lane changes the file again.
  let viewed = $state(viewedAs(lane, file.path) === (file.after ?? file.before ?? ''));
  function setViewed(on) {
    viewed = on;
    markViewed(lane, file.path, on ? (file.after ?? file.before ?? '') : null);
  }

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

  function keep() {
    if (text.trim().length < 2 && suggestion === null) {
      failed = 'Say a few words, or suggest lines.';
      return;
    }
    draft?.({ on: `${file.path}:${writing}`, path: file.path, line: writing, text: text.trim(), suggestion });
    text = '';
    suggestion = null;
    writing = null;
    failed = '';
  }
  const draftsOn = (line) => drafts.filter((one) => one.line === line);
  // The text of a line of the lane, to start a suggestion from.
  const lineText = (line) => hunks.flatMap((hunk) => hunk.rows).find((row) => row.now === line)?.text ?? '';

  const where = (symbol) => {
    if (!symbol.lines) return '';
    return symbol.lines[0] === symbol.lines[1] ? `line ${symbol.lines[0]}` : `lines ${symbol.lines[0]}–${symbol.lines[1]}`;
  };
  const name = (symbol) => symbol.symbol.slice(symbol.symbol.lastIndexOf(':') + 1);
</script>

<section class="panel file" id={`file-${file.path}`}>
  <header>
    <span class={`chip ${file.change === 'removed' ? 'bad' : file.change === 'added' ? 'ok' : ''}`}>{file.change}</span>
    <h2 class="mono">
      {#if file.change === 'removed'}{file.path}{:else}<a href={whyLink(file.path, lane)} title="Why it is the way it is">{file.path}</a>{/if}
    </h2>
    {#if file.was}<span class="soft">was <span class="mono">{file.was}</span></span>{/if}
    <span class="grow"></span>
    {#if file.binary}
      <span class="soft">binary</span>
    {:else}
      <span class="plus">+{file.added}</span>
      <span class="minus">−{file.removed}</span>
    {/if}
    <label class="check viewed" title="Fold it until the lane changes it again">
      <input type="checkbox" checked={viewed} onchange={(event) => setViewed(event.currentTarget.checked)} /> Viewed
    </label>
  </header>

  {#if !viewed}

  {#if file.symbols?.length > 0}
    <ul class="symbols">
      {#each file.symbols as symbol (symbol.symbol)}
        <li>
          <span class="change">{symbol.change}</span>
          {#if symbol.change === 'removed'}
            <span class="mono">{name(symbol)}</span>
          {:else}
            <a class="mono" href={whyLink(symbol.symbol, lane)} title="Why it is the way it is">{name(symbol)}</a>
          {/if}
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
              {#if row.now !== null && mayWrite && draft}
                <button
                  class="bare add"
                  title={`Comment on line ${row.now}`}
                  aria-label={`Comment on line ${row.now} of ${file.path}`}
                  onclick={() => {
                    writing = row.now;
                    text = '';
                    suggestion = null;
                    failed = '';
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
            {#each draftsOn(row.now) as one (one.id)}
              <div class="between">
                <div class="draft">
                  <p class="head"><span class="chip">waiting</span> <span class="faint">sent with your review</span></p>
                  {#if one.text}<p class="text">{one.text}</p>{/if}
                  {#if one.suggestion !== null && one.suggestion !== undefined}
                    <pre class="suggested">{one.suggestion}</pre>
                  {/if}
                  <button class="quiet sm" onclick={() => undraft?.(one.id)}>Take it out</button>
                </div>
              </div>
            {/each}
            {#if writing === row.now}
              <form
                class="between"
                onsubmit={(event) => {
                  event.preventDefault();
                  keep();
                }}
              >
                <textarea
                  bind:value={text}
                  placeholder={`What is there to say about line ${row.now}? It is sent with your review, and its agent told.`}
                  aria-label={`Comment on line ${row.now}`}
                  use:focus
                ></textarea>
                {#if suggestion !== null}
                  <p class="soft small">In the place of line {row.now}:</p>
                  <textarea class="mono code-edit" bind:value={suggestion} aria-label="Suggested lines" spellcheck="false"></textarea>
                {/if}
                <div class="actions">
                  <button class="primary sm">Add to review</button>
                  {#if suggestion === null}
                    <button class="sm" type="button" onclick={() => (suggestion = lineText(row.now))}>Suggest a change</button>
                  {:else}
                    <button type="button" class="quiet sm" onclick={() => (suggestion = null)}>No suggestion</button>
                  {/if}
                  <button type="button" class="quiet sm" onclick={() => (writing = null)}>Cancel</button>
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
  {/if}
</section>

<style>
  .file {
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--line);
    flex-wrap: wrap;
  }
  h2 {
    font-size: 13px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  h2 a {
    color: inherit;
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
    display: inline-grid;
    place-items: center;
    width: 18px;
    height: 18px;
    padding: 0;
    line-height: 1;
    font-size: 13px;
    border: 1px solid var(--accent);
    border-radius: 4px;
    cursor: pointer;
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
  .viewed {
    gap: 6px;
    font-size: 12.5px;
    color: var(--soft);
  }
  .draft {
    border: 1px dashed var(--accent);
    border-radius: 8px;
    background: var(--panel);
    padding: 8px 12px;
    font-size: 13px;
  }
  .draft .head {
    margin: 0;
    display: flex;
    gap: 8px;
    align-items: baseline;
    font-size: 12px;
  }
  .draft .text {
    margin: 4px 0;
    white-space: pre-wrap;
  }
  .suggested,
  .code-edit {
    margin: 4px 0;
    padding: 6px 10px;
    border-radius: 6px;
    background: var(--added);
    font: 12px/1.5 var(--mono);
    white-space: pre;
    overflow-x: auto;
  }
  .code-edit {
    width: 100%;
    min-height: 60px;
    border: 1px solid var(--line-strong);
    color: var(--ink);
  }
  .small {
    margin: 6px 0 0;
    font-size: 12px;
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
