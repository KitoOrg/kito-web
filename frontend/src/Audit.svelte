<script>
  // The server's audit log (Kito 0.35), for its admins: what changed the
  // server and who did it, or each request; and whether the chain of the
  // log is whole.
  import { ago, people } from './api.js';
  import Loading from './Loading.svelte';

  let requests = $state(false);
  let who = $state('');
  let kind = $state('');
  let repo = $state('');
  let days = $state('');
  let entries = $state(null);
  let whole = $state(null);
  let failed = $state('');

  async function load(event) {
    event?.preventDefault();
    const params = { requests, limit: 300 };
    if (who.trim()) params.who = who.trim();
    if (kind.trim()) params.kind = kind.trim();
    if (repo.trim()) params.repo = repo.trim();
    if (days) params.since_ms = Date.now() - Number(days) * 86400000;
    try {
      entries = await people('server.audit', params);
      failed = '';
    } catch (error) {
      failed = error.message;
    }
  }
  async function verify() {
    try {
      whole = await people('server.audit_verify');
    } catch (error) {
      failed = error.message;
    }
  }
  load();
  verify();
</script>

<div class="page-head">
  <div>
    <h1>Audit log</h1>
    <p class="lead">
      What changed the server and who did it, kept forever; each request, kept 90 days. Every line is chained to the one
      before it, so a line taken out or changed is found.
    </p>
  </div>
  <div class="actions">
  {#if whole}
    {#if whole.whole}
      <span class="chip ok" title="Each line carries the hash of the one before">whole · {whole.lines} lines</span>
    {:else}
      <span class="chip bad" title={whole.why}>NOT whole: {whole.why}</span>
    {/if}
  {/if}
  <button onclick={verify}>Check again</button>
  </div>
</div>

<form class="panel filters" onsubmit={load}>
  <label class="check"><input type="checkbox" bind:checked={requests} onchange={() => load()} /> each request</label>
  <input placeholder="who" bind:value={who} />
  <input placeholder="what kind: role_changed, signed_in…" bind:value={kind} />
  <input placeholder="repository" bind:value={repo} />
  <select bind:value={days} onchange={() => load()}>
    <option value="">any time</option>
    <option value="1">last day</option>
    <option value="7">last week</option>
    <option value="30">last month</option>
  </select>
  <button class="primary">Show</button>
</form>
{#if failed}<p class="error" role="alert">{failed}</p>{/if}

{#if entries === null && !failed}
  <Loading lines={6} />
{:else if entries}
  <div class="panel table-wrap">
  <table class="log">
    <thead><tr><th>When</th><th>Who</th><th>What</th><th></th><th>Repository</th></tr></thead>
    <tbody>
      {#each entries as entry}
        <tr class:refused={entry.ok === false || /refused/.test(entry.kind)}>
          <td class="faint" title={new Date(entry.at_ms).toLocaleString()}>{ago(entry.at_ms)}</td>
          <td><b>{entry.by}</b></td>
          <td class="mono">{entry.kind === 'request' ? entry.what : entry.kind}</td>
          <td>{entry.kind === 'request' ? (entry.ok ? '' : 'refused') : entry.what}</td>
          <td class="faint">{entry.repo ?? ''}</td>
        </tr>
      {:else}
        <tr><td colspan="5" class="soft">Nothing.</td></tr>
      {/each}
    </tbody>
  </table>
  </div>
{/if}

<style>
  .filters {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 12px;
    margin: 0 0 16px;
  }
  .filters .check {
    margin-right: 4px;
  }
  .log td b {
    font-weight: 600;
  }
  .refused td {
    color: var(--bad);
  }
</style>
