<script>
  // The lanes of a repository, listed the way one reads them: where each
  // stands, whose it is, what it is on.
  import { ask, focus, laneLink, watch } from './api.js';
  import { count, laneName, laneTitle, sentence, tasked, who } from './format.js';
  import { LANE_PLACES, placeWords, sameCode, standing } from './standing.js';
  import Assistant from './Assistant.svelte';
  import Empty from './Empty.svelte';
  import Err from './Err.svelte';
  import Icon from './Icon.svelte';
  import Loading from './Loading.svelte';
  import PageHead from './PageHead.svelte';
  import State from './State.svelte';
  import Time from './Time.svelte';

  // `user`: who is signed in, behind a server. `role`: what they may do
  // in this repository there; on one's own machine nothing says it, and
  // everything may be done.
  let { user = null, role = undefined } = $props();

  let lanes = $state(null);
  // The closed ones: asked for when somebody wants to see them.
  let closed = $state(null);
  let failed = $state('');
  let filter = $state('open');

  async function loadClosed() {
    const all = await ask('lanes', { all: true });
    // The last one closed comes first.
    closed = all.filter((lane) => lane.state === 'closed').reverse();
  }

  async function load() {
    try {
      const [open, board] = await Promise.all([ask('lanes'), ask('board')]);
      const more = new Map(board.map((one) => [one.id, one]));
      lanes = open.map((lane) => {
        const seen = more.get(lane.id);
        return {
          ...lane,
          last: seen?.last_change_ms ?? 0,
          overlaps: sameCode(seen?.overlaps),
          out_of_scope: lane.out_of_scope ?? seen?.out_of_scope ?? [],
        };
      });
      // A place no lane stands in any more is no choice: back to all of them.
      if (LANE_PLACES.includes(filter) && !lanes.some((lane) => standing(lane).place === filter)) filter = 'open';
      if (closed !== null) await loadClosed();
      failed = '';
    } catch (error) {
      failed = error.message;
    }
  }

  $effect(() => {
    load();
    // Whatever happens in the repository may be in the list.
    return watch(load);
  });

  // A state's words where a title or a choice is: the first letter a capital.

  // The choices above the list, each named by the words of the state it
  // lists: every open lane, then each place somebody acts on that a lane
  // stands in, then the reader's own.
  let filters = $derived.by(() => {
    const open = lanes ?? [];
    const found = [['open', sentence(placeWords('open')), open]];
    for (const place of LANE_PLACES) {
      const there = open.filter((lane) => standing(lane).place === place);
      if (there.length > 0) found.push([place, sentence(placeWords(place)), there]);
    }
    if (user) found.push(['mine', 'Mine', open.filter((lane) => lane.owner === user)]);
    return found;
  });
  let shown = $derived(filter === 'closed' ? closed : (filters.find(([name]) => name === filter)?.[2] ?? []));

  async function pick(name) {
    filter = name;
    if (name !== 'closed' || closed !== null) return;
    try {
      await loadClosed();
    } catch (error) {
      failed = error.message;
    }
  }

  // A lane to open: who works in it, why, and its scope.
  let opening = $state(false);
  let agent = $state('');
  let intent = $state('');
  let scope = $state('');
  let busy = $state(false);
  let openFailed = $state('');
  // The one just opened: where its working copy is stays to be copied.
  let opened = $state(null);

  async function open() {
    busy = true;
    openFailed = '';
    try {
      const items = scope.split(/[\s,]+/).filter((item) => item.length > 0);
      opened = await ask('open_lane', { agent: agent.trim(), intent: intent.trim(), scope: items });
      [agent, intent, scope, opening] = ['', '', '', false];
      await load();
    } catch (error) {
      openFailed = error.message;
    } finally {
      busy = false;
    }
  }
</script>

{#snippet opener()}
  <button class="primary" disabled={opening} onclick={() => ((opening = true), (opened = null))}>Open a lane</button>
{/snippet}

<PageHead title="Lanes" docs="lanes" actions={role === 'read' ? null : opener} />

{#if opening}
  <form
    class="panel pad narrow form"
    onsubmit={(event) => {
      event.preventDefault();
      open();
    }}
  >
    <h3>Open a lane</h3>
    <label class="field">
      <span>Who works in it</span>
      <input bind:value={agent} placeholder="alice" use:focus />
    </label>
    <label class="field">
      <span>Why</span>
      <input bind:value={intent} placeholder="prices in cents" />
    </label>
    <label class="field">
      <span>Scope</span>
      <input class="mono" bind:value={scope} placeholder="src/shop.ts:total" />
      <span class="hint">Functions, files or directories, separated by spaces.</span>
    </label>
    <div class="controls">
      <button class="primary" disabled={busy || agent.trim() === '' || intent.trim() === '' || scope.trim() === ''}>
        {busy ? 'Opening…' : 'Open'}
      </button>
      <button type="button" class="quiet" onclick={() => (opening = false)}>Cancel</button>
    </div>
    <Err message={openFailed} />
  </form>
{/if}
{#if opened}
  <div class="result narrow" role="status">
    <div class="controls">
      <p class="grow"><a class="ref" href={laneLink(opened.id)}>{opened.id}</a> is open: {opened.agent} works in it.</p>
      <button class="quiet sm icon" aria-label="Close" onclick={() => (opened = null)}><Icon name="close" /></button>
    </div>
    {#if opened.workdir}<span>Its working copy: <span class="mono">{opened.workdir}</span></span>{/if}
  </div>
{/if}

<div class="which">
  <div class="seg" role="group" aria-label="Which lanes">
    {#each filters as [name, label, found] (name)}
      <button aria-pressed={filter === name} onclick={() => pick(name)}>
        {label}{#if lanes !== null}<span class="count">{found.length}</span>{/if}
      </button>
    {/each}
    <button aria-pressed={filter === 'closed'} onclick={() => pick('closed')}>
      {sentence(placeWords('closed'))}{#if closed !== null}<span class="count">{closed.length}</span>{/if}
    </button>
  </div>
</div>

{#if failed}
  <Err message={failed} />
{:else if lanes === null || shown === null}
  <Loading />
{:else if shown.length === 0}
  {#if filter === 'mine'}
    <Empty title="No open lane is yours" />
  {:else if filter === 'closed'}
    <Empty title="No closed lanes" />
  {:else}
    <Empty title="No open lanes" />
  {/if}
{:else}
  <ul class="panel rows">
    {#each shown as lane (lane.id)}
      {@const stands = standing(lane)}
      {@const name = laneName(lane.name ?? lane.id)}
      {@const title = laneTitle(lane)}
      <li>
        <a class="row" href={laneLink(lane.name ?? lane.id)}>
          <span class={['ring', stands.tone]} aria-hidden="true"></span>
          <span class="row-body">
            <span class="row-title">{title ?? name}</span>
            <span class="row-meta">
              {#if title}<span class="ref">{name}</span>{/if}
              {#if tasked(lane)}{title ? 'for' : 'For'} <span class="ref">{lane.task}</span>{/if}
              {#if title || tasked(lane)}·{/if}
              <Assistant assistant={lane.assistant} />
              {who(lane.agent, lane.owner)}
              {#if lane.assistant?.model}· <span class="mono">{lane.assistant.model}</span>{/if}
              {#if lane.state !== 'closed'}· {count(lane.files.length, 'file')}{/if}
              {#if lane.last > 0}· changed <Time ms={lane.last} />{/if}
              {#if lane.target && lane.target !== 'main'}· into <span class="ref">{lane.target}</span>{/if}
              {#if lane.scope?.length > 0}
                · <span class="ref">{lane.scope[0]}</span>{#if lane.scope.length > 1}&nbsp;and {lane.scope.length - 1} more{/if}
              {/if}
            </span>
          </span>
          <span class="row-side facts">
            {#if lane.conflicts.length > 0 && stands.place !== 'conflicts'}
              <span class="tag">{count(lane.conflicts.length, 'conflict')}{lane.state === 'ready' ? ' decided' : ''}</span>
            {/if}
            {#if lane.overlaps?.length > 0}<span class="tag">same code as {lane.overlaps.join(', ')}</span>{/if}
            {#if lane.out_of_scope?.length > 0 && stands.place !== 'outside'}<span class="tag">{placeWords('outside')}</span>{/if}
            <State {lane} plain />
          </span>
        </a>
      </li>
    {/each}
  </ul>
{/if}

<style>
  /* The choice of which lanes, on a line of its own above them. */
  .which {
    display: flex;
    margin-bottom: var(--gap);
  }
  /* A lane can have several facts at its side: they leave half the row to its words. */
  .facts {
    max-width: 50%;
  }
  @media (max-width: 640px) {
    .facts {
      max-width: none;
    }
  }
</style>
