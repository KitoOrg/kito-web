<script>
  // Behind a server: who may use a repository and as what, for its
  // maintainers and the server's admins (`repo`); or, with no repository,
  // everybody on the server, for its admins. The server decides who may
  // do what; this page only asks.
  import { ask, focus, laneLink, people, ways } from './api.js';
  import { laneName } from './format.js';
  import { toast } from './toast.svelte.js';
  import Confirm from './Confirm.svelte';
  import Empty from './Empty.svelte';
  import Err from './Err.svelte';
  import Icon from './Icon.svelte';
  import Loading from './Loading.svelte';
  import PageHead from './PageHead.svelte';
  import Time from './Time.svelte';

  let { repo = null, who } = $props();

  const repoRoles = ['read', 'write', 'integrate', 'maintain'];
  const serverRoles = ['member', 'admin', 'owner'];
  // What each role may do: said under the table, and under the role chosen in the form.
  const means = {
    read: 'Sees lanes and follows them.',
    write: 'Opens lanes and works in them; their integrations wait for somebody who may integrate.',
    integrate: 'Integrates lanes into the main lane.',
    maintain: 'Changes the settings, and says who uses the repository.',
    member: 'Uses the repositories they were given.',
    admin: 'Uses every repository, and manages the people and the plugins of the server.',
    owner: 'Does what an admin does, and names admins and owners.',
  };

  let members = $state(null);
  let everyone = $state(null);
  let lanes = $state([]);
  let signIns = $state([]);
  let busy = $state(false);
  // Why the page could not be shown; and why what was asked did not work, by where it was asked: the `form`, the `table`.
  let failed = $state('');
  let wrong = $state({});
  // What adding somebody new gave: how they connect, with their token. It stays until it is closed.
  let invited = $state(null);

  const owner = $derived(who?.role === 'owner');
  const admin = $derived(Boolean(who?.admin));

  async function load() {
    try {
      if (repo) {
        const [said, board] = await Promise.all([ask('server.members'), ask('board').catch(() => [])]);
        members = said.members;
        lanes = board;
      }
      if (admin) everyone = await people('server.people');
      failed = '';
    } catch (error) {
      failed = error.message;
    }
  }
  load();
  ways()
    .then((said) => (signIns = (said.methods ?? []).filter((way) => way.ready !== false)))
    .catch(() => (signIns = []));

  /** Does `work`, and answers whether it worked; what did not is said at `at`. */
  async function act(at, work) {
    busy = true;
    wrong = {};
    let done = true;
    try {
      await work();
    } catch (error) {
      done = false;
      wrong = { [at]: error.message };
    }
    busy = false;
    await load();
    return done;
  }

  const grant = (user, role) =>
    act('table', async () => {
      await ask('server.grant', { user, role });
      toast(`${user} may now ${role}`);
    });
  const revoke = (user) =>
    act('table', async () => {
      await ask('server.grant', { user });
      toast(`${user} removed from ${repo}`);
    });
  const serverRole = (user, role) =>
    act('table', async () => {
      await people('server.people_role', { user, role });
      toast(`${user} is now ${role === 'member' ? 'a member' : `an ${role}`}`);
    });
  const removePerson = (user) =>
    act('table', async () => {
      await people('server.people_remove', { user });
      toast(`${user} removed from this server`);
    });

  // A role is saved as soon as it is chosen; one the server did not take goes back to what it was.
  async function choose(event, save, was) {
    const select = event.currentTarget;
    if (!(await save(select.value))) select.value = was;
  }

  // The form that adds a person, opened from the head of the page. `fresh`:
  // somebody new to the server, by a token or by who they are for a way to
  // sign in; else somebody already on it, who is given this repository.
  const blank = () => ({ user: '', email: '', way: 'token', login: '', role: 'member', repoRole: 'write' });
  let adding = $state(false);
  let fresh = $state(true);
  let it = $state(blank());
  function open() {
    it = blank();
    fresh = !repo;
    adding = true;
  }
  let valid = $derived(it.user.trim() !== '' && (!fresh || it.way === 'token' || it.login.trim() !== ''));

  function add(event) {
    event.preventDefault();
    if (!valid) return;
    const user = it.user.trim();
    const { email, way, login, role, repoRole } = it;
    act('form', async () => {
      if (fresh) {
        const params = { user, role };
        if (email.trim()) params.email = email.trim();
        if (way !== 'token') params.identity = `${way}:${login.trim()}`;
        const said = await people('server.people_add', params);
        const port = said.port ?? '7421';
        const address = `${location.hostname}:${port}/${repo ?? '<repository>'}`;
        // How the server is known: its fingerprint, or, on this machine and in the clear, --plain.
        const known = said.plain ? ' --plain' : said.fingerprint ? ` --fingerprint ${said.fingerprint}` : '';
        const line = said.token ? `kito connect ${address} --token ${said.token}${known}` : `kito connect ${address}${known}`;
        // The token is said this once: it is on the page before anything else can go wrong.
        invited = { user, token: said.token, line, way };
        if (repo) await ask('server.grant', { user, role: repoRole });
      } else {
        await ask('server.grant', { user, role: repoRole });
        toast(`${user} added to ${repo}`);
      }
      adding = false;
    });
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied');
    } catch {
      toast('Not copied: select the line and copy it', 'warn');
    }
  }

  const openLanes = (user) => lanes.filter((lane) => lane.owner === user && lane.state !== 'closed');
  // Those on the server who do not have this repository yet.
  const names = $derived((everyone ?? []).map((person) => person.user).filter((name) => !members?.some((m) => m.user === name)));
</script>

{#snippet person(one)}
  <div class="items">
    <span class="row-title">{one.user}</span>
    {#if one.email}<span class="small soft">{one.email}</span>{/if}
    {#each one.logins ?? [] as login}<span class="tag">{login}</span>{/each}
  </div>
{/snippet}

{#snippet roleHere()}
  <label class="field">
    <span>{fresh ? `In ${repo}` : 'Role'}</span>
    <select bind:value={it.repoRole}>
      {#each repoRoles as role}<option value={role}>{role}</option>{/each}
    </select>
  </label>
{/snippet}

{#snippet roles(which)}
  <h2 class="section-title">Roles</h2>
  <dl class="panel pad kv narrow">
    {#each which as role}
      <dt>{role}</dt>
      <dd>{means[role]}</dd>
    {/each}
  </dl>
{/snippet}

<PageHead title="People" docs="people">
  {#snippet actions()}
    <button class="primary" disabled={adding} onclick={open}>Add a person</button>
  {/snippet}
</PageHead>

<Err message={failed} />

{#if adding}
  <form class="panel pad narrow form" onsubmit={add}>
    <h3>Add a person</h3>
    {#if repo && admin}
      <div>
        <div class="seg" role="group" aria-label="Who is added">
          <button type="button" aria-pressed={!fresh} onclick={() => (fresh = false)}>Already on this server</button>
          <button type="button" aria-pressed={fresh} onclick={() => (fresh = true)}>New to this server</button>
        </div>
      </div>
    {/if}
    <div class="fields">
      <label class="field">
        <span>Name</span>
        <input use:focus list={fresh ? undefined : 'people-names'} placeholder="carol" bind:value={it.user} />
        {#if !fresh && !admin}<span class="hint">An admin adds new people to the server.</span>{/if}
      </label>
      {#if fresh}
        <label class="field">
          <span>Email</span>
          <input placeholder="carol@example.com" bind:value={it.email} />
          <span class="hint">Optional.</span>
        </label>
        <label class="field">
          <span>Signs in with</span>
          <select bind:value={it.way}>
            <option value="token">A token, shown once</option>
            {#each signIns as way}<option value={way.method}>{way.about || way.method}</option>{/each}
          </select>
        </label>
        {#if it.way !== 'token'}
          <label class="field">
            <span>Their login</span>
            <input placeholder="carol" bind:value={it.login} />
          </label>
        {/if}
        <label class="field">
          <span>On the server</span>
          <select bind:value={it.role}>
            {#each serverRoles as role}<option value={role} disabled={!owner && role !== 'member'}>{role}</option>{/each}
          </select>
          {#if !owner}<span class="hint">Only an owner names admins and owners.</span>{/if}
        </label>
        {#if repo}{@render roleHere()}{/if}
      {:else}
        {@render roleHere()}
      {/if}
    </div>
    <datalist id="people-names">
      {#each names as name}<option value={name}></option>{/each}
    </datalist>
    <div class="controls">
      <button class="primary" disabled={busy || !valid}>{busy ? 'Adding…' : 'Add'}</button>
      <button type="button" class="quiet" onclick={() => (adding = false)}>Cancel</button>
    </div>
    <Err message={wrong.form} />
  </form>
{/if}

{#if invited}
  <div class="result narrow" role="status">
    <div class="controls">
      <p class="grow">
        <b>{invited.user}</b> is added.
        {#if invited.token}
          Their token is shown this once: pass it on now.
        {:else}
          They sign in with {invited.way}, and have no token.
        {/if}
      </p>
      <button class="quiet sm icon" aria-label="Close" onclick={() => (invited = null)}><Icon name="close" /></button>
    </div>
    <div class="copy">
      <pre>{invited.line}</pre>
      <button class="sm" onclick={() => copy(invited.line)}>Copy</button>
    </div>
  </div>
{/if}

{#if repo}
  {#if members === null && !failed}
    <Loading />
  {:else if members}
    <div class="stack">
      <div class="panel table-wrap">
        <table>
          <thead>
            <tr><th>Person</th><th>Role</th><th>Last here</th><th>Open lanes</th><th class="actions"><span class="sr">Actions</span></th></tr>
          </thead>
          <tbody>
            {#each members as member (member.user)}
              <tr>
                <td>{@render person(member)}</td>
                <td>
                  {#if member.admin}
                    admin · maintain
                  {:else}
                    <select
                      class="sm"
                      aria-label={`Role of ${member.user}`}
                      value={member.role}
                      disabled={busy}
                      onchange={(event) => choose(event, (role) => grant(member.user, role), member.role)}
                    >
                      {#each repoRoles as role}<option value={role}>{role}</option>{/each}
                    </select>
                  {/if}
                </td>
                <td class="soft"><Time ms={member.seen_ms} /></td>
                <td>
                  <div class="items">
                    {#each openLanes(member.user) as lane}
                      <a class="ref" href={laneLink(lane.id)}>{laneName(lane.id)}</a>
                    {:else}
                      <span class="none">None</span>
                    {/each}
                  </div>
                </td>
                <td class="actions">
                  {#if !member.admin}
                    <Confirm
                      sm
                      label="Remove"
                      ask={`Remove ${member.user} from ${repo}? They can no longer see it or work in it.`}
                      disabled={busy}
                      onyes={() => revoke(member.user)}
                    />
                  {/if}
                </td>
              </tr>
            {:else}
              <tr>
                <td colspan="5"><Empty inset title="Nobody yet" /></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <Err message={wrong.table} />
    </div>
    {@render roles(repoRoles)}
    <p class="footnote">Admins and owners of the server maintain every repository.</p>
  {/if}
{:else if everyone === null && !failed}
  <Loading />
{:else if everyone}
  <div class="stack">
    <div class="panel table-wrap">
      <table>
        <thead>
          <tr><th>Person</th><th>On the server</th><th>Repositories</th><th>Last here</th><th class="actions"><span class="sr">Actions</span></th></tr>
        </thead>
        <tbody>
          {#each everyone as one (one.user)}
            <tr>
              <td>{@render person(one)}</td>
              <td>
                <select
                  class="sm"
                  aria-label={`Role of ${one.user} on the server`}
                  value={one.role}
                  disabled={busy || (!owner && one.role !== 'member') || one.user === who.user}
                  onchange={(event) => choose(event, (role) => serverRole(one.user, role), one.role)}
                >
                  {#each serverRoles as role}<option value={role} disabled={!owner && role !== 'member'}>{role}</option>{/each}
                </select>
              </td>
              <td>
                <div class="items">
                  {#if one.role !== 'member'}<span>every repository</span>{/if}
                  {#each Object.entries(one.access ?? {}) as [name, role]}
                    <a href={`${location.pathname}?repo=${encodeURIComponent(name)}#/people`}>{name} ({role})</a>
                  {:else}
                    {#if one.role === 'member'}<span class="none">None</span>{/if}
                  {/each}
                </div>
              </td>
              <td class="soft"><Time ms={one.seen_ms} /></td>
              <td class="actions">
                {#if one.user !== who.user && (owner || one.role === 'member')}
                  <Confirm
                    sm
                    label="Remove"
                    ask={`Remove ${one.user} from this server? Their token and their sessions stop working.`}
                    disabled={busy}
                    onyes={() => removePerson(one.user)}
                  />
                {/if}
              </td>
            </tr>
          {:else}
            <tr>
              <td colspan="5"><Empty inset title="Nobody yet" /></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <Err message={wrong.table} />
  </div>
  {@render roles(serverRoles)}
  <p class="footnote">Only an owner changes an admin or an owner.</p>
{/if}

<style>
  /* What stands side by side in a cell: a name and what is known of it, lanes, repositories. */
  .items {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 8px;
  }
  /* The line to pass on, and the button that copies it: a long line scrolls in its own box. */
  .copy {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .copy pre {
    flex: 1;
    min-width: 0;
  }
</style>
