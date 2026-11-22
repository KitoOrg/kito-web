<script>
  // The server's repositories (Kito 0.36), for its admins: add one, empty
  // or from a git address; rename and archive; for owners, bring an
  // archived one back or delete it now.
  import { people } from './api.js';
  import { toast } from './toast.svelte.js';
  import Loading from './Loading.svelte';

  let { owner = false } = $props();

  let said = $state(null);
  let failed = $state('');
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
    try {
      await people(method, params);
      toast(saying);
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

<div class="page-head">
  <div>
    <h1>Repositories</h1>
    <p class="lead">
      Every repository of this server. Whoever adds one maintains it, and gives it to others on its People page. To send
      one from your machine, history and all: <code>kito repos add &lt;name&gt; --push &lt;directory&gt;</code> in a
      connected directory.
    </p>
  </div>
</div>
{#if failed}<p class="error" role="alert">{failed}</p>{/if}

<form class="panel add" onsubmit={add}>
  <h2>Add one</h2>
  <label class="field">Name <input bind:value={name} required pattern="[A-Za-z0-9][A-Za-z0-9._\-]*" placeholder="shop" /></label>
  <label class="field">
    <span>From a git address <span class="hint">(empty: a new repository)</span></span>
    <input bind:value={from} placeholder="https://github.com/acme/shop.git" />
  </label>
  {#if from.trim().startsWith('https://')}
    <label class="field">
      <span>Token, for a private one <span class="hint">(used once for the clone, kept nowhere)</span></span>
      <input bind:value={token} type="password" autocomplete="off" />
    </label>
  {/if}
  <div><button class="primary" disabled={busy || !name.trim()}>{busy ? 'Adding…' : 'Add'}</button></div>
</form>

{#if said === null && !failed}
  <Loading />
{:else if said}
  <h2 class="section-title">On this server</h2>
  <div class="panel table-wrap">
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
                <input class="sm" bind:value={renamed} required aria-label="New name" />
                <button class="sm" disabled={busy || !renamed.trim() || renamed.trim() === one.name}>Rename</button>
                <button class="sm quiet" type="button" onclick={() => (renaming = null)}>Cancel</button>
              </form>
            {:else}
              <button class="sm" onclick={() => ((renaming = one.name), (renamed = one.name))}>Rename</button>
              <button
                class="sm"
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
  </div>

  {#if said.archived.length > 0}
    <h2 class="section-title">Archived</h2>
    <p class="soft about">
      Out of reach, and deleted {said.keep_archived_days} days after they were archived.
      {#if !owner}An owner of this server brings one back or deletes it now.{/if}
    </p>
    <div class="panel table-wrap">
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
                    <input class="sm" bind:value={confirm} placeholder={`type ${one.name}`} aria-label="Its name again" />
                    <button class="danger sm" disabled={busy || confirm !== one.name}>Delete for good</button>
                    <button class="sm quiet" type="button" onclick={() => (deleting = null)}>Cancel</button>
                  </form>
                {:else}
                  <button class="sm" disabled={busy} onclick={() => act('server.repo_unarchive', { name: one.name }, `${one.name} is back.`)}>
                    Bring back
                  </button>
                  <button class="sm danger" onclick={() => ((deleting = one.name), (confirm = ''))}>Delete now…</button>
                {/if}
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
    </div>
  {/if}

  {#if Object.keys(said.renamed).length > 0}
    <h2 class="section-title">Old names</h2>
    <p class="soft about">Directories connected with an old name still reach the repository.</p>
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
    gap: 12px;
    padding: 16px;
    margin: 0 0 8px;
    max-width: 560px;
  }
  .about {
    margin: -4px 0 10px;
    font-size: 13px;
  }
  .actions {
    text-align: right;
    white-space: nowrap;
  }
  .actions form {
    display: inline-flex;
    gap: 6px;
  }
  .actions > button + button {
    margin-left: 6px;
  }
  ul {
    margin: 0;
    padding-left: 20px;
    font-size: 13px;
  }
</style>
