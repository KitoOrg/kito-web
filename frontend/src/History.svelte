<script>
  // What was integrated, read as a history of commits is (Kito 0.41): a
  // checkpoint a row, newest first, fifty at a time; with `path`, those
  // that changed that file or directory. A row leads to the checkpoint's
  // page. A Kito that has no list of checkpoints shows its log instead.
  import { ask, checkpointLink, lacked, lacks, watch } from './api.js';
  import { count } from './format.js';
  import { checksStanding } from './standing.js';
  import CheckpointFacts from './CheckpointFacts.svelte';
  import Empty from './Empty.svelte';
  import Err from './Err.svelte';
  import Loading from './Loading.svelte';
  import Log from './Log.svelte';
  import PageHead from './PageHead.svelte';
  import State from './State.svelte';

  let { path = null } = $props();

  const PAGE = 50;
  let older = $state(lacked('checkpoints'));
  let points = $state(null);
  let more = $state(false);
  let next = $state(false);
  let failed = $state('');

  const asked = (extra) => (path ? { ...extra, path } : extra);

  // The newest: the first time all of them, after that those that are new
  // and those that changed (exported to git since) in their places.
  async function load() {
    try {
      const page = await ask('checkpoints', asked({ limit: PAGE }));
      if (points === null) {
        more = page.more;
        points = page.checkpoints;
      } else {
        const now = new Map(page.checkpoints.map((one) => [one.id, one]));
        const known = new Set(points.map((one) => one.id));
        points = [...page.checkpoints.filter((one) => !known.has(one.id)), ...points.map((one) => now.get(one.id) ?? one)];
      }
      failed = '';
    } catch (error) {
      if (lacks(error, 'checkpoints')) older = true;
      else failed = error.message;
    }
  }

  async function showOlder() {
    next = true;
    try {
      const page = await ask('checkpoints', asked({ limit: PAGE, before: points.at(-1).id }));
      points = [...points, ...page.checkpoints];
      more = page.more;
    } catch (error) {
      failed = error.message;
    } finally {
      next = false;
    }
  }

  $effect(() => {
    if (older) return;
    load();
    return watch((events) => events.some((event) => ['integrated', 'checkpoint'].includes(event.kind)) && load());
  });

  // What it is called: why it was made, else its label.
  const titleOf = (point) => point.why ?? point.label;
  // A ring at the start of a row says how its checks ended; a row with none
  // keeps the room, where any row has one, so that the titles line up.
  let ringed = $derived((points ?? []).some((point) => point.checks));
  const open = (event, id) => {
    if (!event.target.closest('a, button')) location.hash = checkpointLink(id);
  };
  let short = $derived(path ? path.slice(path.lastIndexOf('/') + 1) : 'History');
</script>

{#if older}
  <Log />
{:else}
  {#if path}
    <PageHead title={path} mono name={short} back={{ href: '#/history', label: 'History' }} docs="history" />
  {:else}
    <PageHead title="History" docs="history" />
  {/if}

  <Err message={failed} />
  {#if points === null}
    {#if !failed}<Loading lines={5} />{/if}
  {:else if points.length === 0}
    <Empty title={path ? 'No checkpoint changed it' : 'No checkpoints yet'} />
  {:else}
    <ul class="panel rows">
      {#each points as point (point.id)}
        <li>
          <!-- The whole row opens the checkpoint for whoever points; its title is the link for the keyboard. -->
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <div class="row point" onclick={(event) => open(event, point.id)}>
            {#if point.checks}
              <span class={['ring', checksStanding(point.checks).tone]} aria-hidden="true"></span>
            {:else if ringed}
              <span class="unmarked" aria-hidden="true"></span>
            {/if}
            <div class="row-body">
              <a class="row-title title" href={checkpointLink(point.id)}>{titleOf(point)}</a>
              <span class="row-meta">
                <span class="ref">{point.id}</span> · <CheckpointFacts {point} />
                · <span class="plus">+{point.lines_added}</span> <span class="minus">−{point.lines_removed}</span>
                · {count(point.files, 'file')}
                {#if point.git_commit}· <span class="mono">{point.git_commit.slice(0, 7)}</span>{/if}
              </span>
            </div>
            {#if point.approved_by || point.checks}
              <span class="row-side side">
                {#if point.approved_by}<span class="tag">approved by {point.approved_by}</span>{/if}
                <State said={checksStanding(point.checks)} plain />
              </span>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
    {#if more}
      <p class="older">
        <button disabled={next} onclick={showOlder}>{next ? 'Loading…' : 'Show older'}</button>
      </p>
    {/if}
  {/if}
{/if}

<style>
  .point {
    cursor: pointer;
  }
  .point:hover {
    background: var(--hover);
  }
  .title {
    color: inherit;
  }
  .older {
    margin-top: var(--gap);
  }
  /* The room of a ring, where there is none to show: as wide as one. */
  .unmarked {
    width: 16px;
    flex: none;
  }
  @media (max-width: 640px) {
    .unmarked ~ .side {
      padding-left: 28px;
    }
  }
</style>
