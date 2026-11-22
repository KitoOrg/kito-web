<script>
  // Search what was done (Kito 0.34): reasons and what they changed,
  // lanes, tasks, comments, notes. In one repository, or behind a server
  // with none chosen, in every repository the person may use.
  import { ago, askIn, laneLink } from './api.js';
  import Empty from './Empty.svelte';

  let { repo = null, repos = [], team = false, q: given = '' } = $props();

  const kinds = [
    ['', 'everything'],
    ['reason', 'reasons'],
    ['change', 'changes'],
    ['lane', 'lanes'],
    ['task', 'tasks'],
    ['comment', 'comments'],
    ['note', 'notes'],
  ];
  const times = [
    ['', 'any time'],
    [7, 'last week'],
    [30, 'last month'],
    [90, 'last 3 months'],
  ];
  const outcomes = ['', 'integrated', 'given_up', 'open', 'refused', 'conflicted', 'failed_checks'];

  let q = $state(given);
  let kind = $state('');
  let days = $state('');
  let who = $state('');
  let place = $state('');
  let outcome = $state('');
  let found = $state(null);
  let failed = $state('');
  let busy = $state(false);

  async function search(event) {
    event?.preventDefault();
    busy = true;
    failed = '';
    const params = { q, limit: 100 };
    if (kind) params.kinds = [kind];
    if (days) params.since_ms = Date.now() - Number(days) * 86400000;
    if (who.trim()) params.who = who.trim();
    if (place.trim()) params.where = place.trim();
    if (outcome) params.outcome = outcome;
    // One repository, or each the person may use.
    const where = repo || !team ? [team ? repo : null] : repos.map((one) => one.name);
    try {
      const answers = await Promise.all(
        where.map((name) =>
          askIn(name, 'search', params)
            .then((hits) => hits.map((hit) => ({ ...hit, repo: name })))
            .catch(() => []),
        ),
      );
      found = answers.flat().sort((a, b) => (b.at_ms ?? 0) - (a.at_ms ?? 0));
      if (where.length === 1) found = answers[0];
    } catch (error) {
      failed = error.message;
    }
    busy = false;
  }
  if (given) search();

  const prefix = (hit) => (team && hit.repo && hit.repo !== repo ? `?repo=${encodeURIComponent(hit.repo)}` : '');
  function link(hit) {
    if (hit.kind === 'task' || hit.task?.startsWith?.('task#')) return `${prefix(hit)}#/tasks?task=${encodeURIComponent(hit.task ?? hit.id)}`;
    if (hit.kind === 'lane') return `${prefix(hit)}${laneLink(hit.id)}`;
    if (hit.lane) return `${prefix(hit)}${laneLink(hit.lane)}`;
    if (hit.on) return `${prefix(hit)}#/why/${encodeURIComponent(hit.on)}`;
    return null;
  }
  const by = (hit) => (Array.isArray(hit.by) ? hit.by.join(', ') : hit.by);
  const outcomesOf = (hit) => (Array.isArray(hit.outcome) ? hit.outcome : hit.outcome ? [hit.outcome] : []);
</script>

<div class="page-head"><div><h1>Search{repo ? ` in ${repo}` : team ? ' every repository' : ''}</h1></div></div>
<form class="panel filters" onsubmit={search}>
  <input class="words" placeholder="words: prices cents" bind:value={q} />
  <select bind:value={kind}>{#each kinds as [value, label]}<option {value}>{label}</option>{/each}</select>
  <select bind:value={days}>{#each times as [value, label]}<option {value}>{label}</option>{/each}</select>
  <input placeholder="who: person, agent, codex, a model" bind:value={who} />
  <input placeholder="where: src/, a file, file:name" bind:value={place} />
  <select bind:value={outcome}>{#each outcomes as value}<option {value}>{value ? value.replace('_', ' ') : 'any outcome'}</option>{/each}</select>
  <button class="primary" disabled={busy}>Search</button>
</form>
{#if failed}<p class="error" role="alert">{failed}</p>{/if}

{#if found !== null}
  <p class="faint count">{found.length} found</p>
  {#if found.length === 0}
    <Empty title="Nothing found.">Fewer words, or another kind or time, may find it.</Empty>
  {:else}
  <div class="panel hits">
  {#each found as hit}
    <div class="hit">
      <span class="chip kind">{hit.kind}</span>
      <div class="body">
        <div>
          {#if link(hit)}<a href={link(hit)}>{hit.title ?? hit.id}</a>{:else}{hit.title ?? hit.id}{/if}
          {#each outcomesOf(hit) as one}<span class="chip {one === 'integrated' ? 'ok' : ['conflicted', 'failed_checks', 'refused'].includes(one) ? 'bad' : ''}">{one.replace('_', ' ')}</span>{/each}
        </div>
        <div class="faint small">
          {#if team && hit.repo && !repo}{hit.repo} · {/if}{hit.id ?? hit.lane ?? ''} · {by(hit) ?? ''}{#if hit.assistant} · {hit.assistant.name}{hit.assistant.model ? ` ${hit.assistant.model}` : ''}{/if}{#if hit.at_ms} · {ago(hit.at_ms)}{/if}
        </div>
        {#if hit.where?.length}<div class="mono small soft">{hit.where.slice(0, 6).join('  ')}{hit.where.length > 6 ? ' …' : ''}</div>{/if}
      </div>
    </div>
  {/each}
  </div>
  {/if}
{/if}

<style>
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px;
    margin: 0 0 16px;
  }
  .words {
    flex: 1 1 240px;
  }
  .count {
    margin: 0 0 8px;
    font-size: 12.5px;
  }
  .hit {
    display: flex;
    gap: 12px;
    padding: 12px 16px;
    font-size: 13px;
  }
  .hit + .hit {
    border-top: 1px solid var(--line);
  }
  .kind {
    min-width: 64px;
    justify-content: center;
    align-self: flex-start;
  }
  .body {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .body .chip {
    margin-left: 6px;
  }
  .small {
    font-size: 12px;
    overflow-wrap: anywhere;
  }
</style>
