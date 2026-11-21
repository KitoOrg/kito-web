<script>
  // What a person has to say of a lane as a whole: a comment, an
  // approval, a request for changes. Approving brings nothing in:
  // integrating does.
  import { ask } from './api.js';

  // `mine`: this person gave a verdict, which they may take back.
  let { lane, mine = false, changed } = $props();

  let text = $state('');
  let busy = $state(false);
  let failed = $state('');

  async function act(what) {
    busy = true;
    failed = '';
    try {
      await what();
      text = '';
      await changed();
    } catch (error) {
      failed = error.message;
    } finally {
      busy = false;
    }
  }

  const comment = () => act(() => ask('comment', { lane, text }));
  const give = (verdict) => act(() => ask('verdict', { lane, verdict, text: text.trim() || null }));
</script>

<form class="panel say" onsubmit={(event) => event.preventDefault()}>
  <h2>Your review</h2>
  <textarea
    bind:value={text}
    placeholder="What should change, a word with your approval, or a comment on the lane as a whole. Its agent is told before its next edit."
    aria-label="Your review"
  ></textarea>
  <div class="actions">
    <button type="button" class="primary" disabled={busy} onclick={() => give('approve')}>Approve</button>
    <button type="button" disabled={busy || text.trim().length === 0} onclick={() => give('request_changes')}>Request changes</button>
    <button type="button" disabled={busy || text.trim().length < 2} onclick={comment}>Comment</button>
    {#if mine}
      <button type="button" class="quiet" disabled={busy} onclick={() => give('withdraw')}>Withdraw my verdict</button>
    {/if}
  </div>
  <p class="faint note">Approving brings nothing in: integrating does. A request for changes needs its words.</p>
  {#if failed}<p class="error">{failed}</p>{/if}
</form>

<style>
  .say {
    padding: 14px 16px;
  }
  textarea {
    margin-top: 10px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
  }
  .note {
    margin: 8px 0 0;
    font-size: 12px;
  }
  .error {
    margin: 8px 0 0;
  }
</style>
