<script>
  // Behind a server, for its admins: the server's plugins. What is
  // installed and what each was given, what the registry lists, and the
  // four things done to one: install, enable, disable, remove. The server
  // decides who may; this page only asks.
  import { adminChange, adminPlugins } from './api.js';
  import { toast } from './toast.svelte.js';
  import { refresh } from './shell.svelte.js';
  import Confirm from './Confirm.svelte';
  import Empty from './Empty.svelte';
  import Err from './Err.svelte';
  import Icon from './Icon.svelte';
  import Loading from './Loading.svelte';
  import PageHead from './PageHead.svelte';

  let all = $state(null);
  let failed = $state('');
  // What is being done (`enable github`); and why what was asked did not
  // work, by the card it was asked from (`server github`, `registry github`).
  let busy = $state('');
  let wrong = $state({});
  // What the last change said that has to stay on the page: the lines a
  // plugin printed, where what was installed came from.
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

  // What is now true of a plugin, said for a moment when the server has no line to keep.
  const NOW = { install: 'installed', enable: 'enabled', disable: 'disabled', remove: 'removed' };

  async function change(body) {
    busy = `${body.action} ${body.name}`;
    wrong = {};
    done = null;
    try {
      const said = await adminChange(body);
      if ((said?.said ?? []).length > 0 || said?.from) done = said;
      else toast(body.purge ? `${body.name} disabled, its data deleted` : `${body.name} ${NOW[body.action]}`);
      enabling = null;
    } catch (error) {
      wrong = { [`${body.action === 'install' ? 'registry' : 'server'} ${body.name}`]: error.message };
    }
    busy = '';
    await load();
    // What runs on the server decides what the menus show: the shell asks again.
    refresh();
  }

  function startEnabling(plugin) {
    enabling = plugin.name;
    given = Object.fromEntries(plugin.asks.map((permission) => [permission, true]));
    forClients = plugin.for_clients;
  }

  function enable(plugin) {
    const permissions = plugin.asks.filter((permission) => given[permission]);
    return change({ action: 'enable', name: plugin.name, permissions, for_clients: forClients });
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
  // Whether a version is later than another: `0.10.0` is, than `0.9.2`.
  function later(one, other) {
    const [a, b] = [one, other].map((version) => String(version ?? '').split('.').map((part) => parseInt(part, 10) || 0));
    for (let at = 0; at < Math.max(a.length, b.length); at += 1) {
      if ((a[at] ?? 0) !== (b[at] ?? 0)) return (a[at] ?? 0) > (b[at] ?? 0);
    }
    return false;
  }
  // What the registry has that this server does not: a plugin that is not
  // installed, or one installed in an earlier version than the latest.
  let offered = $derived(forServer.filter((listed) => !has.has(listed.name) || later(listed.latest, has.get(listed.name))));

  // The server's GitHub App, as the GitHub plugin says it (`/github/app`):
  // asked for once that plugin is enabled. null: not known yet. A request
  // that failed is taken as no app, and its error is shown.
  let hub = $state(null);
  let hubFailed = $state('');
  let org = $state('');
  let githubOn = $derived(installed.some((plugin) => plugin.name === 'github' && plugin.enabled));
  $effect(() => {
    if (!githubOn) return;
    fetch('/github/app')
      .then(async (response) => {
        const said = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(said.error ?? `the GitHub plugin answered ${response.status}`);
        hub = said;
        hubFailed = '';
      })
      .catch((error) => {
        hub = { app: null, may_create: true };
        hubFailed = error.message;
      });
  });
  // Where the app is made: under an organization when one is named, else under the account of whoever asks.
  let newApp = $derived(`/github/app/new${org.trim() ? `?org=${encodeURIComponent(org.trim())}` : ''}`);
</script>

{#snippet organization()}
  <label class="field">
    <span>GitHub organization</span>
    <input placeholder="acme" bind:value={org} />
    <span class="hint">Leave it empty to create the app under your own account.</span>
  </label>
{/snippet}

<PageHead
  title="Plugins"
  lead="Programs run on the server’s machine. A plugin is installed by its name from the registry, runs nowhere until it is enabled, and is given only what you tick."
/>

<Err message={failed} />

{#if done}
  <div class="result narrow" role="status">
    <div class="controls">
      <p class="grow">{done.done}</p>
      <button class="quiet sm icon" aria-label="Close" onclick={() => (done = null)}><Icon name="close" /></button>
    </div>
    {#each done.said ?? [] as line}
      <p class="mono soft">{line}</p>
    {/each}
    {#if done.from}
      <p class="small faint">From <span class="mono">{done.from.url}</span>, SHA-256 <span class="mono">{done.from.sha256}</span></p>
    {/if}
  </div>
{/if}

{#if all === null && !failed}
  <Loading lines={4} />
{:else if all}
  <div class="narrow">
    <h2 class="section-title">On this server</h2>
    {#if installed.length === 0}
      <Empty title="No plugins yet">Install one from the registry; it runs nowhere until it is enabled.</Empty>
    {/if}
    <div class="stack">
      {#each installed as plugin (plugin.name)}
        <section class="panel pad box">
          <div class="head">
            <h3>{plugin.name}</h3>
            {#if plugin.version}<span class="tag">{plugin.version}</span>{/if}
            {#if plugin.enabled}
              <span class="chip ok">enabled</span>
            {:else if plugin.installed}
              <span class="chip">disabled</span>
            {:else}
              <span class="chip bad">not installed</span>
            {/if}
          </div>
          {#if plugin.description}<p>{plugin.description}</p>{/if}
          {#if plugin.enabled}
            <p class="soft">
              {#if plugin.permissions.length > 0}
                It may: {#each plugin.permissions as permission, i}{i > 0 ? ', ' : ''}<span class="mono">{permission}</span>{/each}.
              {:else}
                It was given no permission.
              {/if}
              {#if plugin.adds.length > 0}It adds: {plugin.adds.join('; ')}.{/if}
              {#if plugin.for_clients}It runs in the directories connected to this server too.{/if}
            </p>
          {/if}
          {#if plugin.serves_pages}
            <p class="hint">It serves these pages: it is disabled on the server’s machine, not from here.</p>
          {/if}
          {#if plugin.problem}<p class="notice">{plugin.problem}</p>{/if}
          {#if plugin.last_failure}<p class="notice">It last failed {plugin.last_failure}</p>{/if}

          {#if plugin.name === 'github' && plugin.enabled && hub}
            <h4>GitHub App</h4>
            {#if hub.app}
              <p>
                The server’s GitHub App is
                <a href={hub.app.url} target="_blank" rel="noreferrer">{hub.app.slug} <Icon name="external" /></a>. Install it on
                repositories at GitHub, then link each repository here in its Settings.
              </p>
              <div class="controls">
                <a class="button sm" href={hub.app.install} target="_blank" rel="noreferrer"
                  >Install on repositories <Icon name="external" /></a
                >
              </div>
              {#if hub.may_create}
                <details>
                  <summary>Replace the app</summary>
                  <div class="box">
                    {@render organization()}
                    <div class="controls"><a class="button sm" href={newApp}>Create a new GitHub App</a></div>
                    <p class="hint">
                      It replaces the one the server keeps: the new app has to be installed on the repositories again.
                    </p>
                  </div>
                </details>
              {/if}
            {:else}
              <p class="soft">
                GitHub makes the server’s app, with its permissions and its webhook. Install it on repositories at GitHub, then link
                each repository here in its Settings.
              </p>
              {#if hub.may_create}
                {@render organization()}
                <div class="controls"><a class="button primary" href={newApp}>Create GitHub App</a></div>
              {/if}
              <Err message={hubFailed} />
            {/if}
          {/if}

          {#if enabling === plugin.name}
            <form
              class="box"
              onsubmit={(event) => {
                event.preventDefault();
                enable(plugin);
              }}
            >
              <h4>What {plugin.name} may do</h4>
              {#if plugin.asks.length > 0}<p class="hint">Untick what it should not be given.</p>{/if}
              {#each plugin.asks as permission}
                <label class="check">
                  <input type="checkbox" bind:checked={given[permission]} />
                  <span><span class="mono">{permission}</span> <span class="soft">{means[permission] ?? ''}</span></span>
                </label>
              {:else}
                <p class="soft">It asks for nothing.</p>
              {/each}
              <label class="check">
                <input type="checkbox" bind:checked={forClients} />
                <span>Run it in the directories connected to this server too, for whoever has it installed</span>
              </label>
              {#if plugin.adds.length > 0}<p class="soft">It adds: {plugin.adds.join('; ')}.</p>{/if}
              <div class="controls">
                <button class="primary sm" disabled={busy !== ''}>{busy === `enable ${plugin.name}` ? 'Enabling…' : 'Enable'}</button>
                <button type="button" class="quiet sm" onclick={() => (enabling = null)}>Cancel</button>
              </div>
            </form>
          {:else if plugin.installed && !plugin.enabled}
            <div class="controls">
              <!-- One that cannot run is not enabled; it can still be removed. -->
              {#if !plugin.problem}<button class="sm" disabled={busy !== ''} onclick={() => startEnabling(plugin)}>Enable</button>{/if}
              <span class="grow"></span>
              <Confirm
                sm
                label="Remove"
                ask={`Remove ${plugin.name} from the server’s machine? Its program is deleted there.`}
                working="Removing…"
                disabled={busy !== ''}
                onyes={() => change({ action: 'remove', name: plugin.name })}
              />
            </div>
          {:else if plugin.enabled && !plugin.serves_pages}
            <div class="controls">
              <Confirm
                sm
                quiet={false}
                danger={false}
                label="Disable"
                ask={`Disable ${plugin.name}? It stops running on this server; what it kept stays.`}
                working="Disabling…"
                disabled={busy !== ''}
                onyes={() => change({ action: 'disable', name: plugin.name, purge: false })}
              />
              <span class="grow"></span>
              <Confirm
                sm
                label="Disable and delete its data"
                ask={`Disable ${plugin.name} and delete its data? What it kept on this server is erased for good.`}
                working="Disabling…"
                disabled={busy !== ''}
                onyes={() => change({ action: 'disable', name: plugin.name, purge: true })}
              />
            </div>
          {/if}
          <Err message={wrong[`server ${plugin.name}`]} />
        </section>
      {/each}
    </div>

    <h2 class="section-title">From the registry</h2>
    <p class="section-lead">
      What <span class="mono">{all.registry}</span> lists for <span class="mono">{all.platform}</span> that this server does not have
      yet, or has in an earlier version.
    </p>
    {#if all.registry_error}
      <Err message={all.registry_error} />
    {:else if forServer.length === 0}
      <Empty title="No plugins for a server yet">
        {#if forPeople.length > 0}
          The registry lists only plugins for the machines people work on.
        {:else}
          The registry lists none.
        {/if}
      </Empty>
    {:else if offered.length === 0}
      <Empty title="Nothing new in the registry">Every plugin it lists for a server is on this one, in its latest version.</Empty>
    {:else}
      <div class="stack">
        {#each offered as listed (listed.name)}
          <section class="panel pad box">
            <div class="head">
              <h3>{listed.name}</h3>
              <span class="tag">{listed.latest}</span>
              {#if has.has(listed.name)}<span class="chip warn">update available</span>{/if}
            </div>
            <p>{listed.about}</p>
            {#if has.has(listed.name)}<p class="soft">This server has {has.get(listed.name)}.</p>{/if}
            <div class="controls">
              <button class="sm" disabled={busy !== ''} onclick={() => change({ action: 'install', name: listed.name })}>
                {#if has.has(listed.name)}
                  {busy === `install ${listed.name}` ? 'Updating…' : 'Update'}
                {:else}
                  {busy === `install ${listed.name}` ? 'Installing…' : 'Install'}
                {/if}
              </button>
            </div>
            <Err message={wrong[`registry ${listed.name}`]} />
          </section>
        {/each}
      </div>
    {/if}
    {#if forPeople.length > 0}
      <p class="footnote">
        Not for a server: {#each forPeople as listed, i}{i > 0 ? ', ' : ''}<span class="mono">{listed.name}</span>{/each}. They set
        up a coding assistant, or work in a repository, on the machines people work on:
        <code>kito plugin add &lt;name&gt;</code> there.
      </p>
    {/if}
  </div>
{/if}

<style>
</style>
