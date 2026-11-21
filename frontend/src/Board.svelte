<script>
  import { ask, watch } from './api.js';
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
</script>

<h1>Lanes</h1>
<p class="soft lead">What is being worked on, each in a lane of its own, and where each stands.</p>

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
  .lead {
    margin: 4px 0 20px;
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
