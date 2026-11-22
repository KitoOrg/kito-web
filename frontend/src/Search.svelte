<script>
  // Search what was done (Kito 0.34): reasons and what they changed,
  // lanes, tasks, comments, notes. In one repository, or behind a server
  // with none chosen, in every repository the person may use.
  import { untrack } from 'svelte';
  import { askIn, laneLink, taskLink, whyLink } from './api.js';
  import { sentence, spans, who } from './format.js';
  import { outcome, taskStanding } from './standing.js';
  import Assistant from './Assistant.svelte';
  import Empty from './Empty.svelte';
  import Err from './Err.svelte';
  import Loading from './Loading.svelte';
  import PageHead from './PageHead.svelte';
  import State from './State.svelte';
  import Time from './Time.svelte';

  // `q`: the words the address asks for; the page is made again for others.
  let { repo = null, repos = [], team = false, q: given = '' } = $props();

  const kinds = [
    ['', 'Everything'],
    ['reason', 'Reasons'],
    ['change', 'Changes'],
    ['lane', 'Lanes'],
    ['task', 'Tasks'],
    ['comment', 'Comments'],
    ['note', 'Notes'],
  ];
  const times = spans(7, 30, 90);
  // What came of a lane, as the daemon names it.
  const outcomes = ['integrated', 'given_up', 'open', 'refused', 'conflicted', 'failed_checks'];
  // A state's words where a choice is: the first letter a capital.

  // The words the page opened with: searched for at once, and then the reader's to change.
  const first = untrack(() => given);
  let q = $state(first);
  let kind = $state('');
  let days = $state('');
  let doer = $state('');
  let place = $state('');
  let came = $state('');
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
    if (doer.trim()) params.who = doer.trim();
    if (place.trim()) params.where = place.trim();
    if (came) params.outcome = came;
    // One repository, or each the person may use.
    const where = repo || !team ? [team ? repo : null] : repos.map((one) => one.name);
    // One repository that cannot be asked does not hide the others.
    const failures = [];
    const answers = await Promise.all(
      where.map((name) =>
        askIn(name, 'search', params)
          .then((hits) => hits.map((hit) => ({ ...hit, repo: name })))
          .catch((error) => (failures.push(error), [])),
      ),
    );
    if (failures.length > 0 && failures.length === where.length) {
      // None of them could: that is no search that found nothing.
      failed = failures[0].message;
      found = null;
    } else {
      found = answers.flat().sort((a, b) => (b.at_ms ?? 0) - (a.at_ms ?? 0));
      if (where.length === 1) found = answers[0];
    }
    busy = false;
  }
  if (first) search();

  const scope = $derived(repo ? `in ${repo}` : team ? 'in every repository you may use' : 'in this repository');

  // A hit of another repository leads into it.
  const prefix = (hit) => (team && hit.repo && hit.repo !== repo ? `?repo=${encodeURIComponent(hit.repo)}` : '');
  const taskIn = (hit, id) => `${prefix(hit)}${taskLink(id)}`;
  // The lane and the task a hit is about, whatever kind it is.
  const laneOf = (hit) => (String(hit.id ?? '').startsWith('lane/') ? hit.id : (hit.lane ?? null));
  const taskOf = (hit) => (hit.kind === 'task' ? hit.id : String(hit.task ?? '').startsWith('task#') ? hit.task : null);

  // A file or a function leads to its why; a directory is no page of its own.
  const code = (hit, target) => ({ text: target, href: target.endsWith('/') ? null : `${prefix(hit)}${whyLink(target)}`, ref: true });

  // Where the title of a hit leads: the lane, the task, or the code it is about.
  function link(hit) {
    const [lane, task] = [laneOf(hit), taskOf(hit)];
    if (hit.kind === 'lane') return `${prefix(hit)}${laneLink(lane)}`;
    if (task) return taskIn(hit, task);
    if (lane) return `${prefix(hit)}${laneLink(lane)}`;
    if (hit.on) return code(hit, hit.on).href;
    return null;
  }

  // The line under a hit: where it is, who did it, when. Each part is
  // words, or a reference that leads somewhere.
  function facts(hit) {
    const [lane, task] = [laneOf(hit), taskOf(hit)];
    // A hit with no words of its own is headed by what it is called: not said again under it.
    const headed = hit.title ? null : hit.id;
    const parts = [];
    if (team && hit.repo && !repo) parts.push({ text: hit.repo, href: `?repo=${encodeURIComponent(hit.repo)}#/` });
    if (lane && lane !== headed) parts.push({ text: lane, href: `${prefix(hit)}${laneLink(lane)}`, ref: true });
    if (task && task !== headed) parts.push({ text: task, href: taskIn(hit, task), ref: true });
    if (hit.checkpoint) parts.push({ text: hit.checkpoint, ref: true });
    // What the hit itself is called, when it is none of those: a checkpoint, a comment, a note.
    if (hit.id && hit.id !== lane && hit.id !== headed && !(task && String(hit.id).startsWith(task))) parts.push({ text: hit.id, ref: true });
    if (hit.on) parts.push(code(hit, hit.on));
    const by = Array.isArray(hit.by) ? hit.by.join(', ') : hit.by;
    if (by) parts.push({ text: who(by, hit.for) });
    if (hit.assistant?.name) parts.push({ assistant: hit.assistant });
    if (hit.at_ms) parts.push({ ms: hit.at_ms });
    return parts;
  }
  // What came of the lane of a hit; of a task, where it stands.
  const outcomesOf = (hit) => (Array.isArray(hit.outcome) ? hit.outcome : hit.outcome ? [hit.outcome] : []);
</script>

<PageHead title="Search" lead={`What was done ${scope}: reasons, changes, lanes, tasks, comments and notes.`} />

<form class="panel filters bar" onsubmit={search}>
  <input class="words" bind:value={q} aria-label="Words to search for" placeholder="prices cents" />
  <select aria-label="Kind" bind:value={kind} onchange={search}>
    {#each kinds as [value, label] (value)}<option {value}>{label}</option>{/each}
  </select>
  <select aria-label="Time" bind:value={days} onchange={search}>
    {#each times as [value, label] (value)}<option {value}>{label}</option>{/each}
  </select>
  <input bind:value={doer} aria-label="Who" placeholder="carol" />
  <input class="mono" bind:value={place} aria-label="Where" placeholder="src/shop.ts:total" />
  <select aria-label="Outcome" bind:value={came} onchange={search}>
    <option value="">Any outcome</option>
    {#each outcomes as value (value)}<option {value}>{sentence(outcome(value).text)}</option>{/each}
  </select>
  <button class="primary" disabled={busy}>{busy ? 'Searching…' : 'Search'}</button>
  <span class="hint about">Who: a person, an agent, an assistant or a model. Where: a file, a directory or a function.</span>
</form>
<Err message={failed} />

{#if busy}
  <Loading />
{:else if found !== null}
  {#if found.length === 0}
    <Empty title="Nothing found">Fewer words, or another kind or time, may find it.</Empty>
  {:else}
    <p class="soft small tally">{found.length} found</p>
    <ul class="panel rows">
      {#each found as hit}
        {@const href = link(hit)}
        <li>
          <div class="row">
            <span class="tag kind">{hit.kind}</span>
            <div class="row-body">
              <div class="row-title">
                {#if hit.kind === 'reason'}
                  <q class="reason">{#if href}<a {href}>{hit.title}</a>{:else}{hit.title}{/if}</q>
                {:else if href}
                  <a {href}>{hit.title || hit.id}</a>
                {:else}
                  {hit.title || hit.id}
                {/if}
                {#each outcomesOf(hit) as one}
                  <State said={hit.kind === 'task' ? taskStanding({ state: one }) : outcome(one)} />
                {/each}
              </div>
              <div class="row-meta">
                {#each facts(hit) as part, at}
                  {#if at > 0}{' · '}{/if}
                  {#if part.assistant}
                    <Assistant assistant={part.assistant} words />
                  {:else if part.ms}
                    <Time ms={part.ms} />
                  {:else if part.href}
                    <a class={[part.ref && 'ref']} href={part.href}>{part.text}</a>
                  {:else}
                    <span class={[part.ref && 'ref']}>{part.text}</span>
                  {/if}
                {/each}
              </div>
              {#if hit.where?.length > 0}
                <div class="row-meta places">
                  {#each hit.where.slice(0, 6).map((target) => code(hit, target)) as part}
                    {#if part.href}<a class="ref" href={part.href}>{part.text}</a>{:else}<span class="ref">{part.text}</span>{/if}
                  {/each}
                  {#if hit.where.length > 6}<span>and {hit.where.length - 6} more</span>{/if}
                </div>
              {/if}
            </div>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
{/if}

<style>
  /* The words take the room the other fields leave. */
  .bar > .words {
    flex: 3 1 240px;
  }
  /* What the fields that have no name take: on a line of its own under them. */
  .about {
    flex-basis: 100%;
  }
  .tally {
    margin-bottom: 8px;
  }
  /* The kind of each hit, in a column of its own. */
  .kind {
    flex: none;
    width: 64px;
  }
  /* The code a hit is about: each place apart from the next, on lines that wrap. */
  .places {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 12px;
  }
</style>
