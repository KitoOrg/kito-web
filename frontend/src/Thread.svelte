<script>
  // A comment and its answers, with a way to answer and to resolve.
  import { ask, ago, focus } from './api.js';

  let { lane, comment, answers = [], changed } = $props();

  let answering = $state(false);
  let text = $state('');
  let busy = $state(false);
  let failed = $state('');

  async function act(what) {
    busy = true;
    failed = '';
    try {
      await what();
      text = '';
      answering = false;
      await changed();
    } catch (error) {
      failed = error.message;
    } finally {
      busy = false;
    }
  }

  const answer = () => act(() => ask('comment', { lane, text, reply_to: comment.id }));
  const resolve = () => act(() => ask('resolve_comment', { comment: comment.id }));
  const who = (said) => (said.for ? `${said.by}, of ${said.for}` : said.by);
</script>

<article class="thread" class:resolved={comment.resolved_by}>
  <div class="said">
    <p class="head">
      <strong>{who(comment)}</strong>
      <span class="faint">{comment.id} · {ago(comment.at_ms)}</span>
      {#if comment.outdated}<span class="chip warn">the code changed since</span>{/if}
      {#if comment.resolved_by}<span class="chip ok">resolved by {comment.resolved_by}</span>{/if}
    </p>
    {#if comment.outdated && comment.quoted}
      <pre class="quoted">{comment.quoted}</pre>
    {/if}
    <p class="text">{comment.text}</p>
  </div>
  {#each answers as said (said.id)}
    <div class="said answer">
      <p class="head">
        <strong>{who(said)}</strong>
        <span class="faint">{said.id} · {ago(said.at_ms)}</span>
      </p>
      <p class="text">{said.text}</p>
    </div>
  {/each}
  {#if !comment.resolved_by}
    {#if answering}
      <form
        onsubmit={(event) => {
          event.preventDefault();
          answer();
        }}
      >
        <textarea bind:value={text} placeholder="Answer…" aria-label={`Answer ${comment.id}`} use:focus></textarea>
        <div class="actions">
          <button class="primary" disabled={busy || text.trim().length < 2}>Answer</button>
          <button type="button" onclick={() => (answering = false)}>Cancel</button>
        </div>
      </form>
    {:else}
      <div class="actions">
        <button class="quiet" onclick={() => (answering = true)}>Answer</button>
        <button class="quiet" disabled={busy} onclick={resolve}>Resolve</button>
      </div>
    {/if}
  {/if}
  {#if failed}<p class="error">{failed}</p>{/if}
</article>

<style>
  .thread {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
    padding: 10px 14px;
    font-family: var(--sans);
    font-size: 14px;
    white-space: normal;
  }
  .thread.resolved {
    opacity: 0.7;
  }
  .said + .said {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
  }
  .answer {
    margin-left: 16px;
  }
  .head {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: baseline;
    font-size: 13px;
  }
  .text {
    margin: 4px 0 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .quoted {
    margin: 6px 0 0;
    padding: 6px 10px;
    border-left: 3px solid var(--line);
    background: var(--bg);
    color: var(--soft);
    font: 12px/1.5 var(--mono);
    overflow-x: auto;
  }
  form {
    margin-top: 10px;
  }
  .actions {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }
  .error {
    margin: 8px 0 0;
  }
</style>
