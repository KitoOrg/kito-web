<script>
  // Where the review of a lane stands, and a verdict to give.
  import { ask } from './api.js';

  let { lane, review, changed } = $props();

  let text = $state('');
  let busy = $state(false);
  let failed = $state('');

  async function give(verdict) {
    busy = true;
    failed = '';
    try {
      await ask('verdict', { lane, verdict, text: text.trim() || null });
      text = '';
      await changed();
    } catch (error) {
      failed = error.message;
    } finally {
      busy = false;
    }
  }

  const who = (verdict) => (verdict.for ? `${verdict.by}, of ${verdict.for}` : verdict.by);
</script>

<section class="panel review" aria-label="Review">
  <h2>Review</h2>
  {#if review.missing}
    <p class="stands"><span class="chip warn">{review.missing}</span></p>
  {:else if review.approved_by.length > 0}
    <p class="stands"><span class="chip ok">approved by {review.approved_by.join(', ')}</span></p>
    <p class="soft small">Approving brings nothing in: <code>kito integrate {lane}</code> does.</p>
  {:else}
    <p class="soft small">No verdict yet{review.required === 0 ? ', and none is needed' : ''}.</p>
  {/if}
  {#if review.required > 0}
    <p class="soft small">Approvals needed: {review.required}</p>
  {/if}

  {#if review.verdicts.length > 0}
    <ul>
      {#each review.verdicts as verdict}
        <li>
          <strong>{verdict.verdict.replaceAll('_', ' ')}</strong> by {who(verdict)}
          {#if verdict.text}<span class="soft">: {verdict.text}</span>{/if}
          {#if verdict.because}<span class="faint"> (does not count: {verdict.because})</span>{/if}
        </li>
      {/each}
    </ul>
  {/if}

  <textarea
    bind:value={text}
    placeholder="What should change (needed to ask for changes), or a word with your approval"
    aria-label="Words of your verdict"
  ></textarea>
  <div class="actions">
    <button class="primary" disabled={busy} onclick={() => give('approve')}>Approve</button>
    <button disabled={busy || text.trim().length === 0} onclick={() => give('request_changes')}>Request changes</button>
    {#if review.verdicts.length > 0}
      <button class="quiet" disabled={busy} onclick={() => give('withdraw')}>Withdraw mine</button>
    {/if}
  </div>
  {#if failed}<p class="error">{failed}</p>{/if}
</section>

<style>
  .review {
    padding: 14px 16px;
  }
  .stands {
    margin: 8px 0 4px;
  }
  .small {
    margin: 4px 0 0;
    font-size: 13px;
  }
  ul {
    margin: 10px 0 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 4px;
    font-size: 14px;
  }
  textarea {
    margin-top: 12px;
    min-height: 54px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }
  .error {
    margin: 8px 0 0;
  }
</style>
