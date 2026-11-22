<script>
  // The lanes of a repository, listed the way one reads them: where each
  // stands, whose it is, what it is on.
  import { ago, ask, focus, laneLink, watch } from './api.js';
  import { lacking, sameCode, standing } from './standing.js';
  import Assistant from './Assistant.svelte';
  import State from './State.svelte';
  import Empty from './Empty.svelte';
  import Loading from './Loading.svelte';

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

  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  let filters = $derived.by(() => {
    const open = lanes ?? [];
    const found = [
      ['open', 'Open', open],
      ['review', 'Awaiting review', open.filter((lane) => lane.state === 'awaiting_approval' || lacking(lane) > 0)],
      ['changes', 'Changes requested', open.filter((lane) => (lane.review ?? '').includes('changes requested'))],
      ['conflicts', 'With conflicts', open.filter((lane) => lane.conflicts.length > 0)],
    ];
    if (user) found.push(['mine', 'Mine', open.filter((lane) => lane.owner === user)]);
    return found;
  });
  let shown = $derived(filter === 'closed' ? closed : (filters.find(([name]) => name === filter)?.[2] ?? []));

  const nothing = {
    open: 'No lane is open.',
    review: 'No lane waits for a review.',
    changes: 'No lane was asked to change.',
    conflicts: 'No lane has a conflict to decide.',
    mine: 'No open lane is yours.',
    closed: 'No lane was closed yet.',
  };

  async function pick(name) {
    filter = name;
    if (name !== 'closed' || closed !== null) return;
    try {
      await loadClosed();
    } catch (error) {
      failed = error.message;
    }
  }

  // A lane to open: for whom, why, and what it will change.
  let opening = $state(false);
  let agent = $state('');
  let intent = $state('');
  let scope = $state('');
  let busy = $state(false);
  let openFailed = $state('');
  let opened = $state(null);

  async function open() {
    busy = true;
    openFailed = '';
    try {
      const declared = scope.split(/[\s,]+/).filter((item) => item.length > 0);
      opened = await ask('open_lane', { agent: agent.trim(), intent: intent.trim(), scope: declared });
      [agent, intent, scope, opening] = ['', '', '', false];
      await load();
    } catch (error) {
      openFailed = error.message;
    } finally {
      busy = false;
    }
  }
</script>

<h1 class="sr">Lanes</h1>

<div class="filters">
  <div class="which seg" role="group" aria-label="Which lanes">
    {#each filters as [name, label, found] (name)}
      <button aria-pressed={filter === name} onclick={() => pick(name)}>{label} <b>{found.length}</b></button>
    {/each}
    <button aria-pressed={filter === 'closed'} onclick={() => pick('closed')}>
      Closed{#if closed !== null}&nbsp;<b>{closed.length}</b>{/if}
    </button>
  </div>
  {#if role !== 'read' && !opening}
    <button class="primary" onclick={() => ((opening = true), (opened = null))}>Open a lane</button>
  {/if}
</div>

{#if opening}
  <form
    class="panel open"
    onsubmit={(event) => {
      event.preventDefault();
      open();
    }}
  >
    <h2>Open a lane</h2>
    <label class="field">Who works in it <input bind:value={agent} placeholder="alice" use:focus /></label>
    <label class="field">Why: what the next agent is told before it changes this code <input bind:value={intent} placeholder="prices in cents" /></label>
    <label class="field"
      >What it will change: functions, files, directories
      <input class="mono" bind:value={scope} placeholder="src/shop.ts:total src/billing/" /></label
    >
    <div class="actions">
      <button class="primary" disabled={busy || agent.trim() === '' || intent.trim() === '' || scope.trim() === ''}>Open</button>
      <button type="button" onclick={() => (opening = false)}>Cancel</button>
    </div>
    {#if openFailed}<p class="error">{openFailed}</p>{/if}
  </form>
{/if}
{#if opened}
  <p class="notice ok">
    <a href={laneLink(opened.id)}>{opened.id}</a> is open for {opened.agent}. Its working copy:
    <span class="mono">{opened.workdir}</span>
  </p>
{/if}

{#if failed}
  <p class="error">{failed}</p>
{:else if lanes === null || shown === null}
  <Loading />
{:else if shown.length === 0}
  <Empty title={nothing[filter]}>
    {#if filter === 'open'}
      An agent opens one with the <code>open_lane</code> tool; a person, with
      <code>kito lane open &lt;agent&gt; --intent "…" --scope …</code>
    {/if}
  </Empty>
{:else}
  <ul class="panel list">
    {#each shown as lane (lane.id)}
      {@const stands = standing(lane)}
      <li>
        <a class="row" href={laneLink(lane.name ?? lane.id)}>
          <span class={`ring ${stands.tone}`} aria-hidden="true"></span>
          <span class="body">
            <span class="title">{lane.task ?? lane.intent ?? 'no intent said'}</span>
            <span class="meta">
              <span class="mono">{lane.name ?? lane.id}</span>
              · <Assistant assistant={lane.assistant} />
              {lane.agent}{#if lane.owner && lane.owner !== lane.agent}&nbsp;for {lane.owner}{/if}
              {#if lane.assistant?.model}· <span class="mono">{lane.assistant.model}</span>{/if}
              {#if lane.state !== 'closed'}· {count(lane.files.length, 'file', 'files')}{/if}
              {#if lane.last > 0}· changed {ago(lane.last)}{/if}
              {#if lane.target}· lands on {lane.target}{/if}
              {#if lane.scope?.length > 0}
                · <span class="mono">{lane.scope[0]}</span>{#if lane.scope.length > 1}&nbsp;+{lane.scope.length - 1}{/if}
              {/if}
            </span>
          </span>
          <span class="side">
            {#if lane.conflicts.length > 0 && stands.text !== 'conflicts to decide'}
              <span class="chip bad">{count(lane.conflicts.length, 'conflict', 'conflicts')}</span>
            {/if}
            {#if lane.overlaps?.length > 0}
              <span class="chip warn" title="Another lane is on the same code">with {lane.overlaps.join(', ')}</span>
            {/if}
            {#if lane.out_of_scope?.length > 0 && stands.text !== 'changes outside its scope'}
              <span class="chip warn">outside its scope</span>
            {/if}
            <State {lane} />
          </span>
        </a>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .filters {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }
  .which {
    flex-wrap: wrap;
  }
  .which button b {
    margin-left: 2px;
    color: var(--faint);
  }
  .which button[aria-pressed='true'] b {
    color: var(--soft);
  }
  .open {
    padding: 16px;
    margin-bottom: 16px;
    display: grid;
    gap: 12px;
    max-width: 720px;
  }
  .actions {
    display: flex;
    gap: 8px;
  }
  .notice.ok {
    margin: 0 0 16px;
    background: var(--ok-bg);
    color: var(--ok);
    border-color: color-mix(in srgb, var(--ok) 25%, transparent);
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: hidden;
  }
  .list li + li {
    border-top: 1px solid var(--line);
  }
  .row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 16px;
    color: inherit;
  }
  .row:hover {
    text-decoration: none;
    background: var(--hover);
  }
  .body {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .title {
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .meta {
    font-size: 12.5px;
    color: var(--soft);
    overflow-wrap: anywhere;
  }
  .side {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
    max-width: 45%;
  }
  @media (max-width: 640px) {
    .which {
      flex-wrap: nowrap;
      max-width: 100%;
      overflow-x: auto;
    }
    .row {
      flex-wrap: wrap;
    }
    .side {
      max-width: none;
      flex-basis: 100%;
      justify-content: flex-start;
      padding-left: 28px;
    }
  }
</style>
