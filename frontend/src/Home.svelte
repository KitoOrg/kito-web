<script>
  // Behind a server, before any repository is chosen: what waits for the
  // person who is signed in, the repositories they may use, and who is at
  // work. One person watches many agents: this is where they see what is
  // stopped until they act.
  import { ago } from './api.js';

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
  <div class="panel none">
    <h1>No repository yet</h1>
    <p class="soft">You are signed in as {who.user}, and this server has no repository you may use. Whoever runs it gives you one.</p>
  </div>
{:else if seen === null}
  <p class="soft">…</p>
{:else}
  <div class="cols">
    <div>
      <h2>Needs you</h2>
      {#if seen.needs.length === 0}
        <div class="panel quiet">Nothing waits for you. Agents are at work, or done.</div>
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

      <h2>Repositories</h2>
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
            <span class="agent" aria-hidden="true">{one.agent.slice(0, 2)}</span>
            <span>
              <b>{one.agent}</b>
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
  h2 {
    font-size: 15px;
    margin: 0 0 8px;
  }
  .cols {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: 20px;
    align-items: start;
  }
  .list {
    list-style: none;
    margin: 0 0 24px;
    padding: 0;
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
    background: color-mix(in srgb, var(--accent) 6%, transparent);
  }
  .body {
    flex: 1;
    min-width: 0;
    display: grid;
  }
  .title {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .meta {
    font-size: 13px;
    color: var(--soft);
  }
  .quiet {
    padding: 16px;
    margin-bottom: 24px;
    color: var(--soft);
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 12px;
  }
  .card {
    display: grid;
    gap: 2px;
    padding: 14px 16px;
    color: inherit;
  }
  .card:hover {
    text-decoration: none;
    border-color: var(--faint);
  }
  .name {
    font-weight: 700;
    font-size: 14px;
    color: var(--accent);
  }
  .role,
  .last {
    font-size: 13px;
  }
  .numbers {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    margin-top: 8px;
    font-size: 13px;
    color: var(--soft);
    font-variant-numeric: tabular-nums;
  }
  .numbers b {
    color: var(--ink);
  }
  .numbers .bad,
  .numbers .bad b {
    color: var(--bad);
  }
  .small {
    font-size: 13px;
    padding: 6px 10px;
  }
  .side section {
    padding: 12px 16px;
  }
  .side section + section {
    border-top: 1px solid var(--line);
  }
  h3 {
    margin: 0 0 8px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--faint);
  }
  .worker {
    display: flex;
    gap: 8px;
    align-items: center;
    margin: 6px 0;
    color: inherit;
    font-size: 14px;
  }
  .worker:hover {
    text-decoration: none;
  }
  .worker .faint {
    display: block;
    font-size: 12px;
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
    font-weight: 700;
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
  .none {
    padding: 24px;
    max-width: 560px;
  }
  .none p {
    margin: 8px 0 0;
  }
  @media (max-width: 820px) {
    .cols {
      grid-template-columns: 1fr;
    }
  }
</style>
