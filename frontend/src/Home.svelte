<script>
  // Behind a server, before any repository is chosen: what waits for the
  // person who is signed in, the repositories they may use, and who is at
  // work. One person watches many agents: this is where they see what is
  // stopped until they act.
  import { assistantOf } from './assistants.js';
  import { count } from './format.js';
  import { standing } from './standing.js';
  import Empty from './Empty.svelte';
  import Err from './Err.svelte';
  import Face from './Face.svelte';
  import Loading from './Loading.svelte';
  import PageHead from './PageHead.svelte';
  import State from './State.svelte';
  import Time from './Time.svelte';

  let { seen, who } = $props();

  // What a repository's lanes come to: how many are open, how many of
  // them stand where somebody acts, and when one last changed.
  function tally(repo) {
    const stands = repo.lanes.map((lane) => standing(lane));
    const places = ['review', 'ready', 'conflicts']
      .map((place) => stands.filter((one) => one.place === place))
      .filter((there) => there.length > 0)
      .map((there) => ({ ...there[0], lanes: there.length }));
    return { open: repo.lanes.length, places, last: Math.max(0, ...repo.board.map((lane) => lane.last_change_ms ?? 0)) };
  }
</script>

<PageHead title="Needs you" lead="What is stopped until you act, in every repository you may use." />

{#if who.repos.length === 0}
  <Empty title="No repository yet">
    You are signed in as {who.user}, and this server has no repository you may use. An admin gives you one.
  </Empty>
{:else if seen === null}
  <Loading />
{:else}
  <div class="cols">
    <div>
      {#if seen.needs.length === 0}
        <Empty title="Nothing waits for you">Agents are at work, or done.</Empty>
      {:else}
        <ul class="panel rows">
          {#each seen.needs as need (need.href + need.kind)}
            <li>
              <a class="row" href={need.href}>
                <span class={['ring', need.tone]} aria-hidden="true"></span>
                <span class="row-body">
                  <span class="row-title">{need.title}</span>
                  <span class="row-meta">
                    {#if need.repo}{need.repo} ·{/if}
                    {#if need.title !== need.id}<span class="ref">{need.id}</span> ·{/if}
                    {need.what}
                  </span>
                </span>
              </a>
            </li>
          {/each}
        </ul>
      {/if}

      <h2 class="section-title">Repositories</h2>
      <div class="cards">
        {#each seen.repos as repo (repo.name)}
          {@const sum = tally(repo)}
          <a class="panel pad" href={`?repo=${encodeURIComponent(repo.name)}#/`}>
            <div class="box">
              <div>
                <h3>{repo.name}</h3>
                <p class="soft small">you may {repo.role}</p>
              </div>
              {#if repo.error}
                <Err message={repo.error} />
              {:else}
                <p class="facts">
                  <span>{count(sum.open, 'open lane')}</span>
                  {#each sum.places as place (place.place)}
                    <span><span class="tag">{place.text}</span> <span class={['count', place.tone === 'bad' && 'bad']}>{place.lanes}</span></span>
                  {/each}
                </p>
                {#if sum.last > 0}<p class="soft small">Last change <Time ms={sum.last} /></p>{/if}
              {/if}
            </div>
          </a>
        {/each}
      </div>
    </div>

    <aside class="stack">
      <section class="panel pad box">
        <h3>At work now</h3>
        {#each seen.atWork as one (one.href)}
          {@const known = one.assistant?.name ? assistantOf(one.assistant) : null}
          <a class="worker" href={one.href}>
            <Face name={one.agent} agent assistant={one.assistant} />
            <span class="row-body">
              <span>
                <span class="row-title name">{one.agent}</span>
                {#if known}
                  <span class="row-meta">{known.label}{#if one.assistant.model}&nbsp;· <span class="mono">{one.assistant.model}</span>{/if}</span>
                {/if}
              </span>
              <span class="row-meta">
                {#if one.repo}{one.repo} ·{/if}
                <span class="ref">{one.id}</span> ·
                {#if one.last > 0}<Time ms={one.last} />{:else}<State said={one.stands} plain />{/if}
              </span>
            </span>
          </a>
        {:else}
          <p class="none">None</p>
        {/each}
      </section>
      {#if seen.overlaps.length > 0}
        <section class="panel pad box">
          <h3>On the same code</h3>
          {#each seen.overlaps as one (one.key)}
            <p class="small soft pair">
              {#if one.repo}<a href={`?repo=${encodeURIComponent(one.repo)}#/`}>{one.repo}</a> ·{/if}
              <a class="ref" href={one.lanes[0].href}>{one.lanes[0].id}</a> and
              <a class="ref" href={one.lanes[1].href}>{one.lanes[1].id}</a>{#if one.what}:
                {#if one.whatHref}<a class="ref" href={one.whatHref}>{one.what}</a>{:else}<span class="ref">{one.what}</span>{/if}
              {/if}
            </p>
          {/each}
          <p class="hint">Their agents were told of each other. Whether the changes agree is for a person to see.</p>
        </section>
      {/if}
    </aside>
  </div>
{/if}

<style>
  /* What a repository's lanes come to, on a line that wraps. */
  .facts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
  }
  /* Who is at work: a face, and beside it who and where. All of it leads to the lane. */
  .worker {
    display: flex;
    align-items: center;
    gap: 8px;
    color: inherit;
  }
  .worker:hover {
    text-decoration: none;
  }
  .worker:hover .name {
    text-decoration: underline;
  }
  .pair {
    overflow-wrap: anywhere;
  }
</style>
