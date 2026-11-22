<script>
  // The server's repositories (Kito 0.36), for its admins: add one, empty
  // or from a git address; rename and archive; for owners, bring an
  // archived one back or delete it now.
  import { people } from './api.js';

  let { owner = false } = $props();

  let said = $state(null);
  let failed = $state('');
  let done = $state('');
  let busy = $state(false);

  let name = $state('');
  let from = $state('');
  let token = $state('');
  let renaming = $state(null);
  let renamed = $state('');
  let deleting = $state(null);
  let confirm = $state('');

  async function load() {
    try {
      said = await people('server.repos_all');
      failed = '';
    } catch (error) {
      failed = error.message;
    }
  }
  load();

  async function act(method, params, saying) {
    busy = true;
    failed = '';
    done = '';
    try {
      await people(method, params);
      done = saying;
      await load();
      return true;
    } catch (error) {
      failed = error.message;
      return false;
    } finally {
      busy = false;
    }
  }

  async function add(event) {
    event.preventDefault();
    const repo = name.trim();
    const params = { name: repo };
    if (from.trim()) params.from = from.trim();
    if (token.trim()) params.token = token.trim();
    // The token is used once: forgotten here as soon as it is sent.
    token = '';
    if (await act('server.repo_add', params, `${repo} is added, and you maintain it.`)) {
      name = '';
      from = '';
    }
  }

  async function rename(event) {
    event.preventDefault();
    const to = renamed.trim();
    if (await act('server.repo_rename', { from: renaming, to }, `${renaming} is ${to} now; the old name still reaches it.`)) {
      renaming = null;
    }
  }

  async function remove(event) {
    event.preventDefault();
    if (await act('server.repo_delete', { name: deleting, confirm }, `${deleting} is deleted.`)) {
      deleting = null;
      confirm = '';
    }
  }

  const size = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  };
  const day = (ms) => new Date(ms).toLocaleDateString();
</script>

<h1>Repositories</h1>
<p class="soft">
  Every repository of this server. Whoever adds one maintains it, and gives it to others on its People page. To send
  one from your machine, history and all: <code>kito repos add &lt;name&gt; --push &lt;directory&gt;</code> in a
  connected directory.
</p>
{#if failed}<p class="error" role="alert">{failed}</p>{/if}
{#if done}<p class="chip ok" role="status">{done}</p>{/if}

<form class="panel add" onsubmit={add}>
  <h2>Add one</h2>
  <label>Name <input bind:value={name} required pattern="[A-Za-z0-9][A-Za-z0-9._\-]*" placeholder="shop" /></label>
  <label>
    From a git address <span class="faint">(empty: a new repository)</span>
    <input bind:value={from} placeholder="https://github.com/acme/shop.git" />
  </label>
  {#if from.trim().startsWith('https://')}
    <label>
      Token, for a private one <span class="faint">(used once for the clone, kept nowhere)</span>
      <input bind:value={token} type="password" autocomplete="off" />
    </label>
  {/if}
  <div><button class="primary" disabled={busy || !name.trim()}>{busy ? 'Adding…' : 'Add'}</button></div>
</form>

{#if said === null && !failed}
  <p class="soft">…</p>
{:else if said}
  <table class="list">
    <thead><tr><th>Repository</th><th>People</th><th>Kept</th><th></th></tr></thead>
    <tbody>
      {#each said.repos as one}
        <tr>
          <td><a href={`?repo=${encodeURIComponent(one.name)}`}>{one.name}</a></td>
          <td>{one.members}</td>
          <td>{size(one.store_bytes)}</td>
          <td class="actions">
            {#if renaming === one.name}
              <form onsubmit={rename}>
                <input bind:value={renamed} required aria-label="New name" />
                <button disabled={busy || !renamed.trim() || renamed.trim() === one.name}>Rename</button>
                <button type="button" onclick={() => (renaming = null)}>Cancel</button>
              </form>
            {:else}
              <button onclick={() => ((renaming = one.name), (renamed = one.name))}>Rename</button>
              <button
                disabled={busy}
                onclick={() =>
                  act(
                    'server.repo_archive',
                    { name: one.name },
                    `${one.name} is archived: nobody reaches it, and it is deleted in ${said.keep_archived_days} days.`,
                  )}>Archive</button
              >
            {/if}
          </td>
        </tr>
      {:else}
        <tr><td colspan="4" class="soft">None yet.</td></tr>
      {/each}
    </tbody>
  </table>

  {#if said.archived.length > 0}
    <h2>Archived</h2>
    <p class="soft">
      Out of reach, and deleted {said.keep_archived_days} days after they were archived.
      {#if !owner}An owner of this server brings one back or deletes it now.{/if}
    </p>
    <table class="list">
      <thead><tr><th>Repository</th><th>Archived</th><th>Deleted on</th><th></th></tr></thead>
      <tbody>
        {#each said.archived as one}
          <tr>
            <td>{one.name}</td>
            <td>{day(one.at_ms)} by {one.by ?? '?'}</td>
            <td>{day(one.deleted_at_ms)}</td>
            <td class="actions">
              {#if owner}
                {#if deleting === one.name}
                  <form onsubmit={remove}>
                    <input bind:value={confirm} placeholder={`type ${one.name}`} aria-label="Its name again" />
                    <button class="danger" disabled={busy || confirm !== one.name}>Delete for good</button>
                    <button type="button" onclick={() => (deleting = null)}>Cancel</button>
                  </form>
                {:else}
                  <button disabled={busy} onclick={() => act('server.repo_unarchive', { name: one.name }, `${one.name} is back.`)}>
                    Bring back
                  </button>
                  <button onclick={() => ((deleting = one.name), (confirm = ''))}>Delete now…</button>
                {/if}
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  {#if Object.keys(said.renamed).length > 0}
    <h2>Old names</h2>
    <p class="soft">Directories connected with an old name still reach the repository.</p>
    <ul>
      {#each Object.entries(said.renamed) as [old, now]}
        <li><span class="mono">{old}</span> → <span class="mono">{now}</span></li>
      {/each}
    </ul>
  {/if}
{/if}

<style>
  .add {
    display: grid;
    gap: 10px;
    padding: 12px 16px;
    margin: 12px 0 20px;
    max-width: 560px;
  }
  .add h2 {
    margin: 0;
    font-size: 15px;
  }
  .add label {
    display: grid;
    gap: 4px;
    font-size: 13px;
  }
  h2 {
    font-size: 15px;
    margin-top: 24px;
  }
  .list {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .list th {
    text-align: left;
    color: var(--soft);
    font-weight: 600;
    font-size: 12px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--line);
  }
  .list td {
    padding: 6px 8px;
    border-bottom: 1px solid var(--line);
  }
  .actions {
    text-align: right;
    white-space: nowrap;
  }
  .actions form {
    display: inline-flex;
    gap: 6px;
  }
  .danger {
    color: var(--bad, #c0392b);
  }
</style>
