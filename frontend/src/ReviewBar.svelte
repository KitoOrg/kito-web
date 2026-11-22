<script>
  // The review being written, always at hand while the lane is read: its
  // comments waiting to be sent, a word for the lane as a whole, and the
  // verdict that sends them all (Kito 0.38). Beside it: where the review
  // and the checks stand, and integrating.
  import { ask } from './api.js';

  let {
    lane,
    drafts,
    review,
    stops = 0,
    user = null,
    owner = null,
    mayIntegrate = false,
    integrating = false,
    sent,
    integrate,
    checks,
  } = $props();

  let open = $state(false);
  let text = $state('');
  let busy = $state(false);
  let failed = $state('');

  const mine = $derived(review.verdicts.some((verdict) => user === null || verdict.by === user));
  const own = $derived(user !== null && owner === user);

  async function send(verdict) {
    busy = true;
    failed = '';
    try {
      await ask('submit_review', {
        lane,
        verdict,
        text: text.trim() || null,
        comments: drafts.map((draft) => ({
          on: draft.on,
          text: draft.text,
          ...(draft.suggestion != null ? { suggestion: draft.suggestion } : {}),
        })),
      });
      text = '';
      open = false;
      await sent();
    } catch (error) {
      failed = error.message;
    } finally {
      busy = false;
    }
  }

  async function withdraw() {
    busy = true;
    failed = '';
    try {
      await ask('verdict', { lane, verdict: 'withdraw' });
      await sent(false);
    } catch (error) {
      failed = error.message;
    } finally {
      busy = false;
    }
  }

  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  let canComment = $derived(drafts.length > 0 || text.trim().length >= 2);
</script>

<div class="bar" class:open role="region" aria-label="Your review">
  {#if open}
    <textarea
      bind:value={text}
      placeholder="A word on the lane as a whole: what should change, or why it is good. Its agent is told with the comments."
      aria-label="Your review of the lane"
    ></textarea>
  {/if}
  <div class="row">
    <button class="bare toggle" onclick={() => (open = !open)} aria-expanded={open}>
      <b>Your review</b>
      {#if drafts.length > 0}<span class="pending">{count(drafts.length, 'comment', 'comments')} waiting</span>{/if}
      <span class="caret">{open ? '▾' : '▴'}</span>
    </button>
    <span class="state">
      {#if review.missing}
        <span class="chip warn">{review.missing}</span>
      {:else if review.approved_by.length > 0}
        <span class="chip ok">approved by {review.approved_by.join(', ')}</span>
      {:else if review.verdicts.some((verdict) => verdict.verdict === 'changes_requested')}
        <span class="chip bad">changes requested</span>
      {/if}
      {#if stops > 0}
        <a class="chip bad" href={checks}>{count(stops, 'thing stands', 'things stand')} in its way</a>
      {/if}
    </span>
    <span class="grow"></span>
    <span class="actions">
      <button disabled={busy || !canComment} onclick={() => send('comment')}>Comment</button>
      <button disabled={busy || (!canComment && !open)} onclick={() => (open && canComment ? send('request_changes') : (open = true))}
        >Request changes</button
      >
      <button
        class="primary"
        disabled={busy || own}
        title={own ? 'The approval of the lane’s owner does not count' : ''}
        onclick={() => send('approve')}>Approve</button
      >
      {#if mine}<button class="quiet" disabled={busy} onclick={withdraw}>Withdraw</button>{/if}
      {#if mayIntegrate}
        <span class="sep" aria-hidden="true"></span>
        <button class="go" disabled={integrating} onclick={integrate}>{integrating ? 'Integrating…' : 'Integrate'}</button>
      {/if}
    </span>
  </div>
  {#if failed}<p class="error" role="alert">{failed}</p>{/if}
</div>

<style>
  .bar {
    position: sticky;
    bottom: 0;
    z-index: 10;
    margin-top: 16px;
    padding: 10px 16px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px 8px 0 0;
    box-shadow: 0 -4px 16px rgba(16, 16, 32, 0.08);
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    min-height: 70px;
    margin-bottom: 8px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  .toggle {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    min-height: var(--control);
    color: var(--ink);
    font-size: 13px;
    cursor: pointer;
  }
  .pending {
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 8px;
    border-radius: 999px;
    background: var(--accent-wash);
    color: var(--accent);
    font-size: 12px;
    font-weight: 500;
  }
  .caret {
    color: var(--faint);
    font-size: 11px;
  }
  .state {
    display: inline-flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .state a:hover {
    text-decoration: none;
  }
  .grow {
    flex: 1;
  }
  .actions {
    display: inline-flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
  }
  .sep {
    width: 1px;
    height: 20px;
    background: var(--line);
    margin: 0 4px;
  }
  .go {
    background: var(--ok);
    border-color: var(--ok);
    color: var(--panel);
  }
  .go:hover:not(:disabled) {
    background: color-mix(in srgb, var(--ok) 88%, var(--ink));
  }
  .error {
    margin: 8px 0 0;
  }
  @media (max-width: 640px) {
    .bar {
      margin-inline: -14px;
      border-radius: 0;
    }
    .actions {
      width: 100%;
    }
    .actions button {
      flex: 1;
    }
  }
</style>
