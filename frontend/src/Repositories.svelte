<script>
  // The server's repositories (Kito 0.36), for its admins: add one, empty
  // or from a git address; rename and archive; for owners, restore an
  // archived one or delete it for good.
  import { focus, people } from './api.js';
  import { count, day, size } from './format.js';
  import { toast } from './toast.svelte.js';
  import { refresh } from './shell.svelte.js';
  import Confirm from './Confirm.svelte';
  import Empty from './Empty.svelte';
  import Err from './Err.svelte';
  import Loading from './Loading.svelte';
  import PageHead from './PageHead.svelte';
  import Time from './Time.svelte';

  let { owner = false } = $props();

  let said = $state(null);
  let failed = $state('');
  // What is being done (`add`, `rename`, …); and why what was asked did
  // not work, by where it was asked: the form (`add`), the table of those
  // in use (`live`), the table of the archived ones (`archived`).
  let busy = $state('');
  let wrong = $state({});

  let adding = $state(false);
  let name = $state('');
  let from = $state('');
  let token = $state('');
  let renaming = $state(null);
  let renamed = $state('');

  async function load() {
    try {
      said = await people('server.repos_all');
      failed = '';
    } catch (error) {
      failed = error.message;
    }
  }
  load();

  async function act(doing, at, method, params, saying) {
    busy = doing;
    wrong = {};
    try {
      await people(method, params);
      toast(saying);
      await load();
      // The list of repositories in the bar is the shell's.
      refresh();
      return true;
    } catch (error) {
      wrong = { [at]: error.message };
      return false;
    } finally {
      busy = '';
    }
  }

  // A name the form takes: letters, digits, dots, dashes and underscores, after a letter or a digit.
  const fits = (text) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(text);

  function cancel() {
    adding = false;
    name = '';
    from = '';
    token = '';
  }

  async function add(event) {
    event.preventDefault();
    const repo = name.trim();
    if (!fits(repo)) return;
    const params = { name: repo };
    if (from.trim()) params.from = from.trim();
    if (token.trim()) params.token = token.trim();
    // The token is used once: forgotten here as soon as it is sent.
    token = '';
    if (await act('add', 'add', 'server.repo_add', params, `${repo} added`)) cancel();
  }

  async function rename(event) {
    event.preventDefault();
    const to = renamed.trim();
    if (await act('rename', 'live', 'server.repo_rename', { from: renaming, to }, `${renaming} renamed to ${to}`)) renaming = null;
  }

  const archive = (repo) => act('archive', 'live', 'server.repo_archive', { name: repo }, `${repo} archived`);
  const restore = (repo) => act('restore', 'archived', 'server.repo_unarchive', { name: repo }, `${repo} restored`);
  // The server asks for the name again: whoever deletes typed it.
  const remove = (repo) => act('delete', 'archived', 'server.repo_delete', { name: repo, confirm: repo }, `${repo} deleted`);

  // The lanes of a repository: where its name leads.
  const lanesOf = (repo) => `${location.pathname}?repo=${encodeURIComponent(repo)}#/`;
  let live = $derived(new Set((said?.repos ?? []).map((one) => one.name)));
</script>

<PageHead title="Repositories" lead="Every repository of this server. Whoever adds one maintains it, and says who else uses it.">
  {#snippet actions()}
    <button class="primary" disabled={adding} onclick={() => (adding = true)}>Add a repository</button>
  {/snippet}
</PageHead>

<Err message={failed} />

{#if adding}
  <form class="panel pad narrow form" onsubmit={add}>
    <h3>Add a repository</h3>
    <label class="field">
      <span>Name</span>
      <input use:focus placeholder="shop" bind:value={name} />
      <span class="hint">Letters, digits, dots, dashes and underscores, after a letter or a digit.</span>
    </label>
    <label class="field">
      <span>Git address</span>
      <input placeholder="https://github.com/acme/shop.git" bind:value={from} />
      <span class="hint">Optional: the repository starts with the history cloned from there. Left empty, it starts new.</span>
    </label>
    {#if from.trim().startsWith('https://')}
      <label class="field">
        <span>Token</span>
        <input type="password" autocomplete="off" bind:value={token} />
        <span class="hint">For a private one: used once for the clone, kept nowhere.</span>
      </label>
    {/if}
    <div class="controls">
      <button class="primary" disabled={busy !== '' || !fits(name.trim())}>{busy === 'add' ? 'Adding…' : 'Add'}</button>
      <button type="button" class="quiet" onclick={cancel}>Cancel</button>
    </div>
    <Err message={wrong.add} />
  </form>
{/if}

{#if said === null && !failed}
  <Loading />
{:else if said}
  <div class="stack">
    <div class="panel table-wrap">
      <table>
        <thead>
          <tr><th>Repository</th><th>People</th><th>Size</th><th class="actions"><span class="sr">Actions</span></th></tr>
        </thead>
        <tbody>
          {#each said.repos as one (one.name)}
            <tr>
              <td><a href={lanesOf(one.name)}>{one.name}</a></td>
              <td>{one.members}</td>
              <td>{size(one.store_bytes)}</td>
              <td class="actions">
                {#if renaming === one.name}
                  <form class="rename" onsubmit={rename}>
                    <input class="sm" use:focus aria-label="New name" bind:value={renamed} />
                    <button class="sm primary" disabled={busy !== '' || !renamed.trim() || renamed.trim() === one.name}>
                      {busy === 'rename' ? 'Saving…' : 'Save'}
                    </button>
                    <button class="sm quiet" type="button" onclick={() => (renaming = null)}>Cancel</button>
                  </form>
                {:else}
                  <button class="quiet sm" disabled={busy !== ''} onclick={() => ((renaming = one.name), (renamed = one.name))}>Rename</button>
                  <Confirm
                    sm
                    label="Archive"
                    ask={`Archive ${one.name}? Nobody reaches it any more, and it is deleted in ${count(said.keep_archived_days, 'day')} unless an owner restores it.`}
                    working="Archiving…"
                    disabled={busy !== ''}
                    onyes={() => archive(one.name)}
                  />
                {/if}
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="4"><Empty inset title="No repositories yet">Add one here, or send one from your machine.</Empty></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <Err message={wrong.live} />
  </div>
  <p class="footnote">
    To send one from your machine, history and all: <code>kito repos add &lt;name&gt; --push &lt;directory&gt;</code> in a connected
    directory.
  </p>

  {#if said.archived.length > 0}
    <h2 class="section-title">Archived</h2>
    <p class="section-lead">
      Out of reach, and deleted {count(said.keep_archived_days, 'day')} after they were archived.
      {#if !owner}An owner of this server restores one, or deletes it before then.{/if}
    </p>
    <div class="stack">
      <div class="panel table-wrap">
        <table>
          <thead>
            <tr><th>Repository</th><th>Archived</th><th>Deleted on</th><th class="actions"><span class="sr">Actions</span></th></tr>
          </thead>
          <tbody>
            {#each said.archived as one (one.name)}
              <tr>
                <td>{one.name}</td>
                <td><Time ms={one.at_ms} /> {one.by ? `by ${one.by}` : ''}</td>
                <td>{day(one.deleted_at_ms)}</td>
                <td class="actions">
                  {#if owner}
                    <Confirm
                      sm
                      danger={false}
                      label="Restore"
                      ask={`Restore ${one.name}? Everybody who used it reaches it again.`}
                      working="Restoring…"
                      disabled={busy !== ''}
                      onyes={() => restore(one.name)}
                    />
                    <Confirm
                      sm
                      label="Delete"
                      typed={one.name}
                      ask={`Delete ${one.name}? Everything it holds is erased for good.`}
                      working="Deleting…"
                      disabled={busy !== ''}
                      onyes={() => remove(one.name)}
                    />
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <Err message={wrong.archived} />
    </div>
  {/if}

  {#if Object.keys(said.renamed).length > 0}
    <h2 class="section-title">Old names</h2>
    <p class="section-lead">Directories connected with an old name still reach the repository.</p>
    <div class="panel table-wrap">
      <table>
        <thead>
          <tr><th>Old name</th><th>Repository</th></tr>
        </thead>
        <tbody>
          {#each Object.entries(said.renamed) as [old, now] (old)}
            <tr>
              <td>{old}</td>
              <td>{#if live.has(now)}<a href={lanesOf(now)}>{now}</a>{:else}{now}{/if}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
{/if}

<style>
  /* The new name and its two buttons, on the row that is renamed. */
  .rename {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
</style>
