<script>
  // A comment and its answers, with a way to answer and to resolve.
  import { ask, focus } from './api.js';
  import { who } from './format.js';
  import Err from './Err.svelte';
  import Time from './Time.svelte';
  import { toast } from './toast.svelte.js';

  // `quote`: the lines it is on are shown with it, where no diff shows them.
  let { lane, comment, answers = [], changed, mayWrite = true, quote = false } = $props();

  let answering = $state(false);
  let text = $state('');
  // What is being done, while it is: `answer`, `resolve` or `apply`.
  let busy = $state('');
  let failed = $state('');

  async function act(name, what, done) {
    busy = name;
    failed = '';
    try {
      await what();
      text = '';
      answering = false;
      toast(done);
      await changed();
    } catch (error) {
      failed = error.message;
    } finally {
      busy = '';
    }
  }

  const answer = () => act('answer', () => ask('comment', { lane, text, reply_to: comment.id }), 'Answer added');
  const resolve = () => act('resolve', () => ask('resolve_comment', { comment: comment.id }), `${comment.id} resolved`);
  const apply = () => act('apply', () => ask('apply_suggestion', { comment: comment.id, lane }), 'Suggestion applied');

  let suggested = $derived(comment.suggestion !== undefined && comment.suggestion !== null);
</script>

<article class={['panel', 'pad', 'thread', comment.resolved_by && 'resolved']}>
  <div class="entry">
    <p class="by">
      <b>{who(comment.by, comment.for)}</b>
      <span class="small faint"><span class="mono">{comment.id}</span> · <Time ms={comment.at_ms} /></span>
      {#if comment.outdated}<span class="tag">outdated</span>{/if}
      {#if comment.resolved_by}
        <span class="chip ok">resolved</span>
        <span class="small soft">by {comment.resolved_by}</span>
      {/if}
    </p>
    <!-- A suggestion shows the lines it would replace itself. -->
    {#if comment.quoted && !suggested && (quote || comment.outdated)}
      <pre>{comment.quoted}</pre>
    {/if}
    <p class="said">{comment.text}</p>
    {#if suggested}
      <div class="suggestion">
        <h4>Suggested change</h4>
        <div>
          {#if comment.quoted}<pre class="was">{comment.quoted}</pre>{/if}
          <pre class="now">{comment.suggestion}</pre>
        </div>
        {#if !comment.resolved_by && !comment.outdated && mayWrite}
          <div class="controls">
            <button class="sm" disabled={busy !== ''} onclick={apply}>{busy === 'apply' ? 'Applying…' : 'Apply it'}</button>
          </div>
        {/if}
      </div>
    {/if}
  </div>
  {#each answers as said (said.id)}
    <div class="entry answer">
      <p class="by">
        <b>{who(said.by, said.for)}</b>
        <span class="small faint"><span class="mono">{said.id}</span> · <Time ms={said.at_ms} /></span>
      </p>
      <p class="said">{said.text}</p>
    </div>
  {/each}
  {#if !comment.resolved_by && mayWrite}
    {#if answering}
      <form
        class="answering"
        onsubmit={(event) => {
          event.preventDefault();
          answer();
        }}
      >
        <label class="field">
          <span>Your answer</span>
          <textarea bind:value={text} use:focus></textarea>
        </label>
        <div class="controls">
          <button class="primary sm" disabled={busy !== '' || text.trim() === ''}>{busy === 'answer' ? 'Answering…' : 'Answer'}</button>
          <button class="quiet sm" type="button" onclick={() => (answering = false)}>Cancel</button>
        </div>
      </form>
    {:else}
      <div class="controls flush">
        <button class="quiet sm" onclick={() => (answering = true)}>Answer</button>
        <button class="quiet sm" disabled={busy !== ''} onclick={resolve}>{busy === 'resolve' ? 'Resolving…' : 'Resolve'}</button>
      </div>
    {/if}
  {/if}
  <Err message={failed} />
</article>

<style>
  /* One column that never grows past the panel: code scrolls inside it. */
  .thread,
  .entry,
  .suggestion,
  .answering {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }
  .thread {
    gap: 12px;
  }
  .thread.resolved {
    opacity: 0.7;
  }
  .entry,
  .suggestion {
    gap: 6px;
  }
  .answer {
    margin-left: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  .by {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 8px;
    align-items: baseline;
  }
  .was {
    background: var(--removed);
    border-radius: var(--radius) var(--radius) 0 0;
  }
  .now {
    background: var(--added);
  }
  .was + .now {
    border-radius: 0 0 var(--radius) var(--radius);
  }
  .answering {
    gap: 8px;
  }
</style>
