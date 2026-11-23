<script>
  // The review being written, always at hand while the lane is read:
  // where the lane stands, the verdict that sends its comments in one go
  // (Kito 0.38), and integrating. Opened, it holds a word for the lane
  // as a whole.
  import { ask, focus } from './api.js';
  import { count, laneName } from './format.js';
  import { heldFor } from './checks.js';
  import { lacking, noReason } from './standing.js';
  import Err from './Err.svelte';
  import Icon from './Icon.svelte';
  import State from './State.svelte';
  import { toast } from './toast.svelte.js';
  import { shell } from './shell.svelte.js';

  // `info`: the lane as the repository has it; `stops`: how many checks
  // stop it, listed at `checks`; `mayIntegrate`: integrating is for who
  // reads this (anybody else who asks leaves the lane merged, checked,
  // and waiting for them). `unexplained`: how many of its changes have
  // no reason yet (Kito 0.42); `holds`: the repository holds approving
  // and integrating until they have one.
  let {
    lane,
    info,
    drafts,
    review,
    stops = 0,
    unexplained = 0,
    holds = false,
    user = null,
    mayIntegrate = false,
    integrating = false,
    sent,
    integrate,
    checks,
  } = $props();

  let open = $state(false);
  let text = $state('');
  // The verdict being sent, while it is.
  let busy = $state('');
  let failed = $state('');

  let name = $derived(laneName(info.name ?? info.id));
  const theirs = (verdict) => user === null || verdict.by === user;
  let mine = $derived(review.verdicts.some(theirs));
  // A lane that is for them: its review is somebody else's.
  let own = $derived(user !== null && info.owner === user);
  // Their approval, of the lane as it is now.
  let approved = $derived(review.verdicts.some((verdict) => theirs(verdict) && verdict.verdict === 'approved' && !verdict.stale));
  let canSay = $derived(drafts.length > 0 || text.trim() !== '');
  // Nobody approves, nor integrates, what does not say why: said beside them, and not as one of the checks.
  let held = $derived(holds && unexplained > 0);
  let others = $derived(stops - (held ? 1 : 0));
  // What there is to do first: integrate a lane nothing stops, or give
  // the approval it lacks.
  let next = $derived(
    mayIntegrate && stops === 0 && !review.missing ? 'integrate' : !own && !approved && !held && lacking(info) > 0 ? 'approve' : '',
  );

  async function send(verdict) {
    busy = verdict;
    failed = '';
    try {
      const words = text.trim();
      await ask('submit_review', {
        lane,
        verdict,
        text: words || null,
        comments: drafts.map((draft) => ({
          on: draft.on,
          text: draft.text,
          ...(draft.suggestion != null ? { suggestion: draft.suggestion } : {}),
        })),
      });
      if (verdict === 'approve') toast(`Approved ${name}`);
      else if (verdict === 'request_changes') toast(`Changes requested on ${name}`);
      else toast(`${count(drafts.length + (words ? 1 : 0), 'comment')} added`);
      text = '';
      open = false;
      await sent();
    } catch (error) {
      // Somebody saved meanwhile: what has no reason now is said, not what the server tells its agent.
      const left = verdict === 'approve' ? await heldFor(lane, error) : 0;
      failed = left > 0 ? `Not approved: ${noReason(left)}.` : error.message;
      if (left > 0) await sent(false);
    } finally {
      busy = '';
    }
  }

  async function withdraw() {
    busy = 'withdraw';
    failed = '';
    try {
      await ask('verdict', { lane, verdict: 'withdraw' });
      toast('Verdict withdrawn');
      await sent(false);
    } catch (error) {
      failed = error.message;
    } finally {
      busy = '';
    }
  }

  // How tall it is, said to the shell: what is said for a moment stands over it.
  let height = $state(0);
  $effect(() => {
    shell.foot = height;
    return () => (shell.foot = 0);
  });
</script>

<!-- First in its row when it is what there is to do, last when it is not. -->
{#snippet integrateButton()}
  <button class={[next === 'integrate' && 'primary']} disabled={integrating || stops > 0} onclick={integrate}>
    {integrating ? 'Integrating…' : 'Integrate'}
  </button>
{/snippet}

<div class={['panel', 'bar', open && 'open']} role="region" aria-label="Your review" bind:clientHeight={height}>
  {#if open}
    <label class="field">
      <span>Your review</span>
      <textarea bind:value={text} use:focus></textarea>
      {#if drafts.length > 0}<span class="hint">Sent with the {count(drafts.length, 'comment')} left on its lines.</span>{/if}
    </label>
  {/if}
  <div class="line">
    <div class="stands">
      <State lane={info} />
      {#if unexplained > 0}
        <span class="hint"><a href={checks}>{noReason(unexplained)}</a></span>
      {/if}
      {#if others > 0}
        <span class="hint"><a href={checks}>{count(others, 'check stops', 'checks stop')} it</a></span>
      {/if}
    </div>
    <div class="buttons">
      {#if next === 'integrate'}{@render integrateButton()}{/if}
      {#if !own}
        <button class={[next === 'approve' && 'primary']} disabled={busy !== '' || held} onclick={() => send('approve')}>
          {busy === 'approve' ? 'Approving…' : 'Approve'}
        </button>
      {/if}
      <button
        class="more"
        disabled={busy !== '' || (open && !canSay)}
        onclick={() => (open && canSay ? send('request_changes') : (open = true))}
      >
        {busy === 'request_changes' ? 'Requesting…' : 'Request changes'}
      </button>
      <button class="more" disabled={busy !== '' || (open && !canSay)} onclick={() => (canSay ? send('comment') : (open = true))}>
        {busy === 'comment' ? 'Commenting…' : 'Comment'}
      </button>
      {#if mine}
        <button class="quiet more" disabled={busy !== ''} onclick={withdraw}>{busy === 'withdraw' ? 'Withdrawing…' : 'Withdraw'}</button>
      {/if}
      {#if next !== 'integrate'}{@render integrateButton()}{/if}
    </div>
    <button
      class="quiet"
      aria-expanded={open}
      aria-label={drafts.length > 0 ? `Your review, ${count(drafts.length, 'comment')} waiting` : 'Your review'}
      onclick={() => (open = !open)}
    >
      {#if drafts.length > 0}<span class="count accent">{drafts.length}</span>{/if}
      <Icon name={open ? 'chevron-down' : 'chevron-up'} />
    </button>
  </div>
  <Err message={failed} />
</div>

<style>
  /* Stays at the foot of the window while the lane is read. */
  .bar {
    position: sticky;
    bottom: 0;
    z-index: 10;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    margin-top: 16px;
    padding: 12px var(--pad-panel);
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    box-shadow: var(--raise-shadow);
  }
  .line,
  .stands,
  .buttons {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .stands {
    flex: 1 1 auto;
  }
  /* Where one row does not hold it all, two: where the lane stands and
     the way into the review, then what is pressed. */
  @media (max-width: 900px) {
    .line {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .buttons {
      grid-row: 2;
      grid-column: 1 / -1;
    }
  }
  /* On a phone the second row is what is pressed first, as wide as the
     screen; the rest of the review is behind the way in. */
  @media (max-width: 640px) {
    .buttons button {
      flex: 1;
    }
    .bar:not(.open) .more {
      display: none;
    }
  }
</style>
