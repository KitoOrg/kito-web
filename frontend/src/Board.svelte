<script>
  import { ask, focus, watch } from './api.js';
  import State from './State.svelte';

  let lanes = $state(null);
  let failed = $state('');

  async function load() {
    try {
      lanes = await ask('lanes');
      failed = '';
    } catch (error) {
      failed = error.message;
    }
  }

  $effect(() => {
    load();
    // Whatever happens in the repository may be on the board.
    return watch(load);
  });

  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

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

<div class="top">
  <div>
    <h1>Lanes</h1>
    <p class="soft lead">What is being worked on, each in a lane of its own, and where each stands.</p>
  </div>
  {#if !opening}<button onclick={() => ((opening = true), (opened = null))}>Open a lane</button>{/if}
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
    <label>Who works in it <input bind:value={agent} placeholder="alice" use:focus /></label>
    <label>Why: what the next agent is told before it changes this code <input bind:value={intent} placeholder="prices in cents" /></label>
    <label
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
  <p class="notice">
    <a href={`#/lane/${opened.id.replace('lane/', '')}`}>{opened.id}</a> is open for {opened.agent}. Its working copy:
    <span class="mono">{opened.workdir}</span>
  </p>
{/if}

{#if failed}
  <p class="error">{failed}</p>
{:else if lanes === null}
  <p class="soft">…</p>
{:else if lanes.length === 0}
  <div class="panel empty">
    <p>No lane is open.</p>
    <p class="soft">
      An agent opens one with the <code>open_lane</code> tool; a person, with
      <code>kito lane open &lt;agent&gt; --intent "…" --scope …</code>
    </p>
  </div>
{:else}
  <ul class="lanes">
    {#each lanes as lane (lane.id)}
      <li class="panel">
        <a class="row" href={`#/lane/${lane.name ?? lane.id.replace('lane/', '')}`}>
          <span class="id mono">{lane.name ?? lane.id}</span>
          <span class="what">
            <span class="intent">{lane.task ?? lane.intent ?? 'no intent said'}</span>
            <span class="who soft">
              {lane.agent}{#if lane.owner && lane.owner !== lane.agent}, for {lane.owner}{/if}
              · {count(lane.files.length, 'file', 'files')}
              {#if lane.target}· lands on {lane.target}{/if}
              {#if lane.conflicts.length > 0}· {count(lane.conflicts.length, 'conflict', 'conflicts')}{/if}
            </span>
          </span>
          <State {lane} />
        </a>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }
  .lead {
    margin: 4px 0 20px;
  }
  .open {
    padding: 14px 16px;
    margin-bottom: 16px;
    display: grid;
    gap: 10px;
    max-width: 720px;
  }
  label {
    display: grid;
    gap: 4px;
    font-size: 13px;
    color: var(--soft);
  }
  input {
    padding: 7px 10px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--panel);
    color: var(--ink);
    font: inherit;
    font-size: 14px;
  }
  input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .actions {
    display: flex;
    gap: 6px;
  }
  .notice {
    margin: 0 0 16px;
    padding: 8px 14px;
    border-radius: 8px;
    background: var(--ok-bg);
    color: var(--ok);
    font-size: 14px;
    overflow-wrap: anywhere;
  }
  .lanes {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 16px;
    color: inherit;
  }
  .row:hover {
    text-decoration: none;
    background: color-mix(in srgb, var(--accent) 6%, transparent);
  }
  .id {
    min-width: 72px;
    color: var(--soft);
  }
  .what {
    flex: 1;
    display: grid;
    min-width: 0;
  }
  .intent {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .who {
    font-size: 13px;
  }
  .empty {
    padding: 20px 24px;
  }
  .empty p {
    margin: 0 0 4px;
  }
</style>
