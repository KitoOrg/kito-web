<script>
  // What a lane did to one file: its functions, its lines, why each
  // change was made (Kito 0.42), and what was said on them.
  import { untrack } from 'svelte';
  import { codeLink, focus, whyLink } from './api.js';
  import { markViewed, viewedAs } from './review.js';
  import ChangeReason from './ChangeReason.svelte';
  import Confirm from './Confirm.svelte';
  import Icon from './Icon.svelte';
  import Thread from './Thread.svelte';
  import { toast } from './toast.svelte.js';

  // `drafts`: the comments of the review being written, on this file;
  // `draft`, `undraft`: add one, remove one (Kito 0.38). `at`: what a
  // checkpoint changed (Kito 0.41), the file shown as it was then.
  // `viewing`: it can be marked as viewed, where something is reviewed.
  let { lane, file, threads, changed, drafts = [], draft = null, undraft = null, mayWrite = true, at = null, viewing = true } = $props();

  // Whoever may write in an open lane says why it changed what has no reason yet.
  let explains = $derived(mayWrite && Boolean(lane) && !at);
  // A change its lane said why for, or one waiting to, has its reason where the intents were (Kito 0.42).
  const reasoned = (change) => Boolean(change.why) || Boolean(change.unexplained);

  // Where the file and its functions are read: at the checkpoint, or as the lane has them.
  let fileHref = $derived(at ? codeLink(file.path, { at }) : whyLink(file.path, lane));
  const symbolHref = (symbol) => whyLink(symbol, at ? null : lane);

  // The line a comment is being written on (its number in the lane's text).
  let writing = $state(null);
  let text = $state('');
  // Lines suggested in the place of the one commented on; null: none.
  let suggestion = $state(null);

  // Viewed: folded, until the lane changes the file again. Asked once,
  // of the file as it is when it is first shown.
  let viewed = $state(untrack(() => viewing && viewedAs(at ?? lane, file.path) === (file.after ?? file.before ?? '')));
  function setViewed(on) {
    viewed = on;
    markViewed(at ?? lane, file.path, on ? (file.after ?? file.before ?? '') : null);
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

  function write(line) {
    writing = line;
    text = '';
    suggestion = null;
  }
  // A comment says something, or suggests lines.
  let ready = $derived(text.trim() !== '' || suggestion !== null);
  function keep() {
    draft?.({ on: `${file.path}:${writing}`, path: file.path, line: writing, text: text.trim(), suggestion });
    text = '';
    suggestion = null;
    writing = null;
    toast('Comment added to your review');
  }
  function remove(id) {
    undraft?.(id);
    toast('Draft removed');
  }
  const draftsOn = (line) => drafts.filter((one) => one.line === line);
  // The text of a line of the lane, to start a suggestion from.
  const lineText = (line) => hunks.flatMap((hunk) => hunk.rows).find((row) => row.now === line)?.text ?? '';

  const where = (symbol) => (symbol.lines[0] === symbol.lines[1] ? `line ${symbol.lines[0]}` : `lines ${symbol.lines[0]}–${symbol.lines[1]}`);
  const name = (symbol) => symbol.symbol.slice(symbol.symbol.lastIndexOf(':') + 1);
</script>

<section class="panel file" id={`file-${file.path}`}>
  <div class="panel-head">
    <h3 class="mono">
      {#if file.change === 'removed'}{file.path}{:else}<a href={fileHref}>{file.path}</a>{/if}
    </h3>
    {#if file.change !== 'changed'}<span class="tag">{file.change}</span>{/if}
    {#if file.was}<span class="small soft">was <span class="mono">{file.was}</span></span>{/if}
    <span class="grow"></span>
    {#if file.binary}
      <span class="tag">binary</span>
    {:else}
      <span class="plus">+{file.added}</span>
      <span class="minus">−{file.removed}</span>
    {/if}
    {#if viewing}
      <label class="check">
        <input type="checkbox" checked={viewed} onchange={(event) => setViewed(event.currentTarget.checked)} /> Viewed
      </label>
    {/if}
  </div>

  {#if !viewed}
    {#if reasoned(file)}
      <div class="whole" id={file.unexplained ? `reason-${file.path}` : undefined}>
        <ChangeReason {lane} on={file.path} why={file.why} unexplained={file.unexplained} may={explains} {changed} />
      </div>
    {/if}
    {#if file.symbols?.length > 0}
      <ul class="symbols">
        {#each file.symbols as symbol (symbol.symbol)}
          <li id={symbol.unexplained ? `reason-${symbol.symbol}` : undefined}>
            <span class="tag change">{symbol.change}</span>
            {#if symbol.change === 'removed'}
              <span class="ref">{name(symbol)}</span>
            {:else}
              <a class="ref" href={symbolHref(symbol.symbol)}>{name(symbol)}</a>
            {/if}
            {#if symbol.lines}<span class="small faint">{where(symbol)}</span>{/if}
            {#if symbol.was}<span class="small soft">was <span class="mono">{symbol.was}</span></span>{/if}
            {#if symbol.why && symbol.why === file.why}
              <!-- The file's reason, which covers it: said once, on the file's line. -->
            {:else if reasoned(symbol)}
              <ChangeReason {lane} on={symbol.symbol} why={symbol.why} unexplained={symbol.unexplained} may={explains} {changed} />
            {:else}
              {#each symbol.intents ?? [] as intent}
                <q class="reason">{intent}</q>
              {/each}
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if above.length > 0}
      <div class="above">
        {#each above as thread (thread.comment.id)}
          <p class="small soft">On <span class="mono">{thread.comment.on}</span></p>
          <Thread {lane} comment={thread.comment} answers={thread.answers} {changed} {mayWrite} />
        {/each}
      </div>
    {/if}

    {#if hunks.length > 0}
      <div class="lines" role="table" aria-label={`Changes to ${file.path}`}>
        {#each hunks as hunk}
          <div class="hunk faint">{hunk.head}</div>
          {#each hunk.rows as row}
            <div class={['line', row.mark === '+' && 'added', row.mark === '-' && 'removed']} role="row">
              <span class="number faint">{row.old ?? ''}</span>
              <span class="number faint">{row.now ?? ''}</span>
              <span class="say">
                {#if row.now !== null && mayWrite && draft}
                  <button class="bare add" aria-label={`Comment on line ${row.now}`} onclick={() => write(row.now)}>
                    <Icon name="plus" size={14} />
                  </button>
                {/if}
              </span>
              <span class="mark">{row.mark === ' ' ? '' : row.mark === '-' ? '−' : '+'}</span>
              <span class="text">{row.text}</span>
            </div>
            {#if row.now !== null}
              {#each on(row.now) as thread (thread.comment.id)}
                <div class="between">
                  <Thread {lane} comment={thread.comment} answers={thread.answers} {changed} {mayWrite} />
                </div>
              {/each}
              {#each draftsOn(row.now) as one (one.id)}
                <div class="between">
                  <div class="panel pad draft">
                    <p><span class="tag">draft</span> <span class="small faint">sent with your review</span></p>
                    {#if one.text}<p class="said">{one.text}</p>{/if}
                    {#if one.suggestion !== null && one.suggestion !== undefined}
                      <pre class="suggested">{one.suggestion}</pre>
                    {/if}
                    <div class="controls flush">
                      <Confirm label="Remove" ask="Remove this draft? What you wrote in it is lost." onyes={() => remove(one.id)} sm />
                    </div>
                  </div>
                </div>
              {/each}
              {#if writing === row.now}
                <form
                  class="between writing"
                  onsubmit={(event) => {
                    event.preventDefault();
                    keep();
                  }}
                >
                  <label class="field">
                    <span>Comment on line {row.now}</span>
                    <textarea bind:value={text} use:focus></textarea>
                  </label>
                  {#if suggestion !== null}
                    <label class="field">
                      <span>In the place of line {row.now}</span>
                      <textarea class="mono" bind:value={suggestion} wrap="off" spellcheck="false"></textarea>
                    </label>
                  {/if}
                  <div class="controls">
                    <button class="primary sm" disabled={!ready}>Comment</button>
                    {#if suggestion === null}
                      <button class="sm" type="button" onclick={() => (suggestion = lineText(row.now))}>Suggest a change</button>
                    {:else}
                      <button class="sm" type="button" onclick={() => (suggestion = null)}>No suggestion</button>
                    {/if}
                    <button class="quiet sm" type="button" onclick={() => (writing = null)}>Cancel</button>
                  </div>
                </form>
              {/if}
            {/if}
          {/each}
        {/each}
      </div>
    {:else if !file.binary && file.change === 'renamed'}
      <p class="pad soft">Renamed, with what is in it unchanged.</p>
    {/if}
  {/if}
</section>

<style>
  .file {
    overflow: hidden;
  }
  .symbols {
    display: grid;
    gap: 2px;
    margin: 0;
    padding: 8px var(--pad-panel);
    border-bottom: 1px solid var(--line);
    list-style: none;
  }
  .symbols li {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 8px;
    align-items: baseline;
    overflow-wrap: anywhere;
  }
  .change {
    min-width: 60px;
  }
  /* The reason of the file itself, over those of its functions. */
  .whole {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 8px;
    align-items: baseline;
    padding: 8px var(--pad-panel);
    border-bottom: 1px solid var(--line);
    overflow-wrap: anywhere;
  }
  .above {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
    padding: 12px var(--pad-panel);
    border-bottom: 1px solid var(--line);
  }
  /* The lines: each as tall as the button that comments on it. */
  .lines {
    font: 12px/20px var(--mono);
    overflow-x: auto;
  }
  .hunk {
    padding: 2px var(--pad-panel);
    background: var(--bg);
  }
  .line {
    display: grid;
    grid-template-columns: 44px 44px 24px 16px 1fr;
    white-space: pre;
    min-width: max-content;
  }
  .line.added {
    background: var(--added);
  }
  .line.removed {
    background: var(--removed);
  }
  .number {
    padding-right: 8px;
    text-align: right;
    user-select: none;
  }
  .say {
    display: grid;
    place-items: center;
  }
  .mark {
    color: var(--soft);
    user-select: none;
  }
  .added .mark {
    color: var(--added-ink);
  }
  .removed .mark {
    color: var(--removed-ink);
  }
  .text {
    padding-right: var(--pad-panel);
  }
  /* Shown on the line the pointer is on, and to whoever comes by keyboard. */
  .add {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: var(--radius);
    background: var(--accent);
    color: var(--accent-ink);
    cursor: pointer;
    opacity: 0;
  }
  .line:hover .add,
  .add:focus-visible {
    opacity: 1;
  }
  /* Where nothing points before it presses: always there, and quiet. */
  @media (hover: none) {
    .add {
      background: none;
      color: var(--faint);
      opacity: 1;
    }
  }
  /* What is said between two lines starts under the code, in the words' own type. */
  .between {
    padding: 8px var(--pad-panel) 8px 112px;
    border-block: 1px solid var(--line);
    background: var(--bg);
    font: 13px/1.5 var(--sans);
    white-space: normal;
  }
  .writing,
  .draft {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }
  .draft {
    border-style: dashed;
    border-color: var(--line-strong);
  }
  .suggested {
    background: var(--added);
  }
  @media (max-width: 640px) {
    .line {
      grid-template-columns: 36px 36px 24px 14px 1fr;
    }
    .between {
      padding-left: var(--pad-panel);
    }
  }
</style>
