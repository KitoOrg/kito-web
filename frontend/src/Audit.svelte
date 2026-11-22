<script>
  // The server's audit log (Kito 0.35), for its admins: what changed the
  // server and who did it, or each request; and whether the chain of the
  // log is whole.
  import { people } from './api.js';
  import { count, humanize, spans } from './format.js';
  import { outcome } from './standing.js';
  import { toast } from './toast.svelte.js';
  import Empty from './Empty.svelte';
  import Err from './Err.svelte';
  import Loading from './Loading.svelte';
  import PageHead from './PageHead.svelte';
  import State from './State.svelte';
  import Time from './Time.svelte';

  // The most lines one search asks for.
  const LIMIT = 300;

  let requests = $state(false);
  let who = $state('');
  let kind = $state('');
  let repo = $state('');
  let days = $state('');
  let entries = $state(null);
  let loading = $state(true);
  // Whether the last search was narrowed: what to say when it found nothing.
  let narrowed = $state(false);
  let failed = $state('');
  let whole = $state(null);
  let checking = $state(false);
  let checkFailed = $state('');

  // Searches answer in the order they come back: only the last one asked is shown.
  let asked = 0;
  async function load(event) {
    event?.preventDefault();
    const params = { requests, limit: LIMIT };
    if (who.trim()) params.who = who.trim();
    if (kind.trim()) params.kind = kind.trim();
    if (repo.trim()) params.repo = repo.trim();
    if (days) params.since_ms = Date.now() - Number(days) * 86400000;
    const mine = ++asked;
    loading = true;
    failed = '';
    try {
      const found = await people('server.audit', params);
      if (mine !== asked) return;
      entries = found;
      narrowed = Object.keys(params).length > 2;
      failed = '';
    } catch (error) {
      if (mine !== asked) return;
      failed = error.message;
    }
    loading = false;
  }

  // `told`: somebody asked for it, and is told what it found.
  async function verify(told = false) {
    checking = true;
    checkFailed = '';
    try {
      whole = await people('server.audit_verify');
      if (told) toast(whole.whole ? 'The log is whole' : 'The log is broken', whole.whole ? 'ok' : 'bad');
    } catch (error) {
      checkFailed = error.message;
    }
    checking = false;
  }
  load();
  verify();
</script>

<PageHead title="Audit log" docs="audit-log">
  {#snippet after()}
    {#if whole?.whole}
      <span class="chip ok">whole</span>
      <span class="small soft">{count(whole.lines, 'line')}</span>
    {:else if whole}
      <span class="chip bad">broken</span>
    {/if}
  {/snippet}
  {#snippet actions()}
    <button disabled={checking} onclick={() => verify(true)}>{checking ? 'Checking…' : 'Check again'}</button>
  {/snippet}
</PageHead>

<Err message={checkFailed} />
{#if whole && !whole.whole}
  <p class="notice">The chain of the log is broken at {whole.why}.</p>
{/if}

<form class="panel filters" onsubmit={load}>
  <label class="check">
    <input
      type="checkbox"
      checked={requests}
      onchange={(event) => {
        requests = event.currentTarget.checked;
        load();
      }}
    />
    Each request
  </label>
  <input aria-label="Who" placeholder="Who" bind:value={who} />
  <input aria-label="Kind" placeholder="Kind" bind:value={kind} />
  <input aria-label="Repository" placeholder="Repository" bind:value={repo} />
  <select
    aria-label="Time"
    value={days}
    onchange={(event) => {
      days = event.currentTarget.value;
      load();
    }}
  >
    {#each spans(1, 7, 30) as [n, label]}<option value={n}>{label}</option>{/each}
  </select>
  <button class="primary" disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
</form>
<Err message={failed} />

{#if loading && !failed}
  <Loading lines={6} />
{:else if entries}
  <div class="panel table-wrap">
    <table>
      <thead>
        <tr><th>When</th><th>Who</th><th>Kind</th><th>What</th><th>Repository</th></tr>
      </thead>
      <tbody>
        {#each entries as entry}
          <tr>
            <td class="soft"><Time ms={entry.at_ms} /></td>
            <td><span class="row-title">{entry.by}</span></td>
            <td class="mono">{entry.kind === 'request' ? entry.what : entry.kind}</td>
            <td>
              {#if entry.kind !== 'request'}
                {humanize(entry.what)}
              {:else if !entry.ok}
                <State said={outcome('refused')} />
              {/if}
            </td>
            <td>{entry.repo ?? ''}</td>
          </tr>
        {:else}
          <tr>
            <td colspan="5">
              {#if narrowed}
                <Empty inset title="Nothing matches" />
              {:else}
                <Empty inset title="Nothing in the log yet" />
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if entries.length >= LIMIT}
    <p class="footnote">The latest {LIMIT} are shown.</p>
  {/if}
{/if}
