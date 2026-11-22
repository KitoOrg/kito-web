<script>
  // Behind a server, for its administrators: the server's plugins. What is
  // installed and what each was given, what the registry lists, and the
  // four things done to one: install, enable, disable, remove. The server
  // decides who may; this page only asks.
  import { adminChange, adminPlugins } from './api.js';
  import { toast } from './toast.svelte.js';
  import Loading from './Loading.svelte';
  import Empty from './Empty.svelte';

  let all = $state(null);
  let failed = $state('');
  let busy = $state('');
  // What the last change said, and whether the server must start again.
  let done = $state(null);
  // The plugin being enabled: what it is given is chosen before it is.
  let enabling = $state(null);
  let given = $state({});
  let forClients = $state(false);

  async function load() {
    try {
      all = await adminPlugins();
      failed = '';
    } catch (error) {
      failed = error.message;
    }
  }
  load();

  async function change(body) {
    busy = `${body.action} ${body.name}`;
    failed = '';
    done = null;
    try {
      done = await adminChange(body);
      if (done?.done) toast(done.done);
      enabling = null;
    } catch (error) {
      failed = error.message;
    }
    busy = '';
    await load();
  }

  function startEnabling(plugin) {
    enabling = plugin.name;
    given = Object.fromEntries(plugin.asks.map((permission) => [permission, true]));
    forClients = plugin.for_clients;
  }

  function enable(plugin) {
    const permissions = plugin.asks.filter((permission) => given[permission]);
    change({ action: 'enable', name: plugin.name, permissions, for_clients: forClients });
  }

  function disable(plugin, purge) {
    const what = purge ? `Disable ${plugin.name} and remove what it kept on the server?` : `Disable ${plugin.name}?`;
    if (confirm(what)) change({ action: 'disable', name: plugin.name, purge });
  }

  function remove(plugin) {
    if (confirm(`Remove ${plugin.name} from the server's machine?`)) change({ action: 'remove', name: plugin.name });
  }

  // What each permission lets a plugin do, in a few words.
  const means = {
    read: 'read the repositories',
    write: 'comment, review, open and close lanes',
    integrate: 'integrate lanes and decide conflicts',
    admin: 'change the rules of a repository',
    sign_in: 'say who somebody is',
    pages: 'serve pages at the server’s address',
    server_events: 'be told what happens on the server',
    server_admin: 'add commands to kito-server',
  };

  let installed = $derived(all?.installed ?? []);
  let has = $derived(new Map(installed.filter((plugin) => plugin.installed).map((plugin) => [plugin.name, plugin.version])));

  // Where each runs (Kito 0.36.1): a plugin for the machines people work
  // on is not offered here. One the registry says nothing of is.
  const runsHere = (listed) => !listed.runs?.length || listed.runs.includes('server');
  let forServer = $derived((all?.listed ?? []).filter(runsHere));
  let forPeople = $derived((all?.listed ?? []).filter((listed) => !runsHere(listed)));
</script>

<div class="page-head">
  <div>
    <h1>Plugins of this server</h1>
    <p class="lead">
      A plugin is a program run on the server’s machine. It is installed by its name from the registry, runs nowhere
      until it is enabled, and is given only what you tick.
    </p>
  </div>
</div>

{#if failed}
  <p class="error" role="alert">{failed}</p>
{/if}
{#if done && ((done.said ?? []).length > 0 || done.from)}
  <div class="panel said">
    <p>{done.done}</p>
    {#each done.said ?? [] as line}
      <p class="mono soft">{line}</p>
    {/each}
    {#if done.from}
      <p class="faint mono">from {done.from.url} · SHA-256 {done.from.sha256}</p>
    {/if}
  </div>
{/if}

{#if all === null && !failed}
  <Loading lines={4} />
{:else if all}
  <h2 class="section-title">On this server</h2>
  {#if installed.length === 0}
    <Empty title="None yet.">Install one from the registry below; it runs nowhere until it is enabled.</Empty>
  {/if}
  {#each installed as plugin (plugin.name)}
    <section class="panel plugin">
      <div class="head">
        <span class="name mono">{plugin.name}</span>
        {#if plugin.version}<span class="faint">{plugin.version}</span>{/if}
        {#if plugin.enabled}
          <span class="chip ok">enabled</span>
          {#if plugin.for_clients}<span class="chip">for clients too</span>{/if}
        {:else if plugin.installed}
          <span class="chip">not enabled</span>
        {:else}
          <span class="chip bad">not installed</span>
        {/if}
        <span class="grow"></span>
        {#if plugin.installed && !plugin.enabled && !plugin.problem}
          <button class="primary sm" disabled={busy !== ''} onclick={() => startEnabling(plugin)}>Enable…</button>
          <button class="sm" disabled={busy !== ''} onclick={() => remove(plugin)}>Remove</button>
        {:else if plugin.enabled && !plugin.serves_pages}
          <button class="sm" disabled={busy !== ''} onclick={() => disable(plugin, false)}>Disable</button>
          <button class="quiet sm danger" disabled={busy !== ''} onclick={() => disable(plugin, true)}>Disable and purge</button>
        {/if}
      </div>
      {#if plugin.description}<p>{plugin.description}</p>{/if}
      {#if plugin.enabled}
        <p class="soft">
          It may: {plugin.permissions.length > 0 ? plugin.permissions.join(', ') : 'nothing'}.
          {#if plugin.adds.length > 0}It adds: {plugin.adds.join('; ')}.{/if}
        </p>
      {/if}
      {#if plugin.serves_pages}
        <p class="faint">It serves these pages: it is disabled on the server’s machine, not from here.</p>
      {/if}
      {#if plugin.name === 'github' && plugin.enabled}
        <div class="actions">
          <a class="button primary" href="/github/app/new">Create GitHub App</a>
          <a class="button" href="/github/app/new?org=" onclick={(event) => {
            const org = prompt('The GitHub organization the app belongs to');
            if (!org) event.preventDefault();
            else event.currentTarget.href = `/github/app/new?org=${encodeURIComponent(org.trim())}`;
          }}>…for an organization</a>
        </div>
        <p class="faint">
          GitHub makes the server’s app with its permissions and webhook; install it on repositories, then link each in its
          Settings. Making it again replaces the one this server keeps.
        </p>
      {/if}
      {#if plugin.problem}<p class="error">{plugin.problem}</p>{/if}
      {#if plugin.last_failure}<p class="error">It last failed {plugin.last_failure}</p>{/if}

      {#if enabling === plugin.name}
        <form
          class="give"
          onsubmit={(event) => {
            event.preventDefault();
            enable(plugin);
          }}
        >
          <p><strong>What {plugin.name} asks for.</strong> Untick what it should not have.</p>
          {#each plugin.asks as permission}
            <label class="check"><input type="checkbox" bind:checked={given[permission]} /> <span class="mono">{permission}</span> <span class="soft">{means[permission] ?? ''}</span></label>
          {/each}
          {#if plugin.asks.length === 0}<p class="soft">It asks for nothing.</p>{/if}
          <label class="check"><input type="checkbox" bind:checked={forClients} /> Run it in the directories connected to this server too, for whoever has it installed</label>
          {#if plugin.adds.length > 0}<p class="soft">It adds: {plugin.adds.join('; ')}.</p>{/if}
          <div class="actions">
            <button class="primary" disabled={busy !== ''}>Enable {plugin.name}</button>
            <button type="button" class="quiet" onclick={() => (enabling = null)}>Cancel</button>
          </div>
        </form>
      {/if}
    </section>
  {/each}

  <h2 class="section-title">In the registry</h2>
  <p class="faint mono where">{all.registry} · {all.platform}</p>
  {#if all.registry_error}
    <p class="error">{all.registry_error}</p>
  {:else if (all.listed ?? []).length === 0}
    <p class="soft">The registry lists no plugin yet.</p>
  {/if}
  {#each forServer as listed (listed.name)}
    <section class="panel plugin">
      <div class="head">
        <span class="name mono">{listed.name}</span>
        <span class="faint">{listed.latest}</span>
        {#if has.get(listed.name) === listed.latest}
          <span class="chip ok">installed</span>
        {:else if has.has(listed.name)}
          <span class="chip warn">{has.get(listed.name)} installed</span>
        {/if}
        <span class="grow"></span>
        {#if has.get(listed.name) !== listed.latest}
          <button class="sm" disabled={busy !== ''} onclick={() => change({ action: 'install', name: listed.name })}>
            {has.has(listed.name) ? `Update to ${listed.latest}` : 'Install'}
          </button>
        {/if}
      </div>
      <p>{listed.about}</p>
    </section>
  {/each}
  {#if forPeople.length > 0}
    <p class="soft elsewhere">
      Not for a server: {#each forPeople as listed, i}<span class="mono">{listed.name}</span>{i < forPeople.length - 1
          ? ', '
          : ''}{/each}. They set up a coding assistant, or work in a repository, on the machines people work on:
      <code>kito plugin add &lt;name&gt;</code> there.
    </p>
  {/if}
{/if}

<style>
  .elsewhere {
    margin-top: 16px;
    font-size: 13px;
  }
  .where {
    margin: -4px 0 10px;
    font-size: 12px;
  }
  .plugin {
    padding: 14px 16px;
    margin-bottom: 8px;
    font-size: 13px;
  }
  .plugin p {
    margin: 6px 0 0;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .name {
    font-weight: 600;
    font-size: 13px;
  }
  .grow {
    flex: 1;
  }
  .said {
    padding: 12px 16px;
    margin: 0 0 16px;
    font-size: 13px;
  }
  .said p {
    margin: 0 0 4px;
    overflow-wrap: anywhere;
  }
  .give {
    display: grid;
    gap: 8px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  .give p {
    margin: 0;
  }
  .give .check {
    align-items: flex-start;
  }
  .give .check input {
    margin-top: 3px;
  }
  .actions {
    display: flex;
    gap: 8px;
    margin-top: 6px;
  }
</style>
