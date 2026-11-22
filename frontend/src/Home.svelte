<script>
  // Behind a server, before any repository is chosen: what waits for the
  // person who is signed in, the repositories they may use, and who is at
  // work. One person watches many agents: this is where they see what is
  // stopped until they act.
  import { ago } from './api.js';
  import { assistantOf } from './assistants.js';
  import Assistant from './Assistant.svelte';
  import Empty from './Empty.svelte';
  import Loading from './Loading.svelte';

  let { seen, who } = $props();

  // What a repository's lanes come to, in three numbers.
  const tally = (repo) => ({
    open: repo.lanes.length,
    waiting: repo.lanes.filter((lane) => lane.state === 'awaiting_approval').length,
    conflicts: repo.lanes.reduce((sum, lane) => sum + (lane.conflicts?.length ?? 0), 0),
    last: Math.max(0, ...repo.board.map((lane) => lane.last_change_ms ?? 0)),
  });
</script>

{#if who.repos.length === 0}
  <Empty title="No repository yet">
    You are signed in as {who.user}, and this server has no repository you may use. Whoever runs it gives you one.
  </Empty>
{:else if seen === null}
  <Loading />
{:else}
  <div class="cols">
    <div>
      <h2 class="section-title">Needs you</h2>
      {#if seen.needs.length === 0}
        <Empty title="Nothing waits for you.">Agents are at work, or done.</Empty>
      {:else}
        <ul class="panel list">
          {#each seen.needs as need (need.href + need.kind)}
            <li>
              <a class="row" href={need.href}>
                <span class={`ring ${need.tone}`} aria-hidden="true"></span>
                <span class="body">
                  <span class="title">{need.title}</span>
                  <span class="meta"><span class="mono">{need.where}</span> · {need.what}</span>
                </span>
                <span class={`chip ${need.tone}`}>{need.kind}</span>
              </a>
            </li>
          {/each}
        </ul>
      {/if}

      <h2 class="section-title">Repositories</h2>
      <div class="cards">
        {#each seen.repos as repo (repo.name)}
          {@const sum = tally(repo)}
          <a class="panel card" href={`?repo=${encodeURIComponent(repo.name)}#/`}>
            <span class="name mono">{repo.name}</span>
            <span class="faint role">you may {repo.role}</span>
            {#if repo.error}
              <span class="error small">{repo.error}</span>
            {:else}
              <span class="numbers">
                <span><b>{sum.open}</b> {sum.open === 1 ? 'open lane' : 'open lanes'}</span>
                {#if sum.waiting > 0}<span><b>{sum.waiting}</b> waiting</span>{/if}
                {#if sum.conflicts > 0}<span class="bad"><b>{sum.conflicts}</b> {sum.conflicts === 1 ? 'conflict' : 'conflicts'}</span>{/if}
              </span>
              <span class="faint last">{sum.last > 0 ? `Last change ${ago(sum.last)}` : 'Nothing in progress'}</span>
            {/if}
          </a>
        {/each}
      </div>
    </div>

    <aside class="panel side">
      <section>
        <h3>At work now</h3>
        {#if seen.atWork.length === 0}
          <p class="faint">No lane is open.</p>
        {/if}
        {#each seen.atWork as one (one.href)}
          <a class="worker" href={one.href}>
            {#if one.assistant?.name}
              <Assistant assistant={one.assistant} big />
            {:else}
              <span class="agent" aria-hidden="true">{one.agent.slice(0, 2)}</span>
            {/if}
            <span>
              <b>{one.agent}</b>
              {#if one.assistant?.name}
                <span class="with">
                  {assistantOf(one.assistant).label}{#if one.assistant.model}&nbsp;· {one.assistant.model}{/if}
                </span>
              {/if}
              <span class="faint">{one.where} · {one.last > 0 ? ago(one.last) : one.state.replaceAll('_', ' ')}</span>
            </span>
          </a>
        {/each}
      </section>
      {#if seen.overlaps.length > 0}
        <section>
          <h3>On the same code</h3>
          {#each seen.overlaps as one (one.key)}
            <a class="overlap" href={one.href}>
              <span class="mono">{one.where}</span>{#if one.what}: <span class="mono">{one.what}</span>{/if}
            </a>
          {/each}
          <p class="faint">Their agents were told of each other. Whether the changes agree is for a person to see.</p>
        </section>
      {/if}
    </aside>
  </div>
{/if}

<style>
  .cols {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: 24px;
    align-items: start;
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
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 12px;
  }
  .card {
    display: grid;
    gap: 2px;
    padding: 14px 16px;
    color: inherit;
    transition: border-color 0.12s;
  }
  .card:hover {
    text-decoration: none;
    border-color: var(--line-strong);
  }
  .name {
    font-weight: 600;
    font-size: 13px;
    color: var(--ink);
  }
  .role,
  .last {
    font-size: 12.5px;
  }
  .numbers {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    margin: 8px 0 2px;
    font-size: 12.5px;
    color: var(--soft);
    font-variant-numeric: tabular-nums;
  }
  .numbers b {
    color: var(--ink);
    font-weight: 600;
  }
  .numbers .bad,
  .numbers .bad b {
    color: var(--bad);
  }
  .small {
    margin: 6px 0 0;
  }
  .side {
    overflow: hidden;
  }
  .side section {
    padding: 14px 16px;
  }
  .side section + section {
    border-top: 1px solid var(--line);
  }
  h3 {
    margin: 0 0 10px;
  }
  .worker {
    display: flex;
    gap: 10px;
    align-items: center;
    margin: 0 -8px;
    padding: 6px 8px;
    border-radius: var(--radius);
    color: inherit;
    font-size: 13px;
  }
  .worker:hover {
    text-decoration: none;
    background: var(--hover);
  }
  .worker b {
    font-weight: 600;
  }
  .worker .faint {
    display: block;
    font-size: 12px;
  }
  .with {
    margin-left: 4px;
    font-size: 12px;
    color: var(--soft);
  }
  .agent {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 6px;
    background: var(--done-bg);
    color: var(--done);
    font-size: 11px;
    font-weight: 600;
    flex: none;
  }
  .overlap {
    display: block;
    font-size: 13px;
    color: var(--soft);
    margin: 4px 0;
  }
  .side p {
    margin: 6px 0 0;
    font-size: 12px;
  }
  @media (max-width: 820px) {
    .cols {
      grid-template-columns: 1fr;
    }
  }
</style>
