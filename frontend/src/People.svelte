<script>
  // Behind a server: who may use a repository and as what, for its
  // maintainers and the server's admins (`repo`); or, with no repository,
  // everybody on the server, for its admins. The server decides who may
  // do what; this page only asks.
  import { ago, ask, laneLink, people, ways } from './api.js';

  let { repo = null, who } = $props();

  const repoRoles = ['read', 'write', 'integrate', 'maintain'];
  const serverRoles = ['member', 'admin', 'owner'];
  const means = {
    read: 'sees lanes and follows them',
    write: 'opens lanes and works in them; their integrations wait',
    integrate: 'brings lanes into the main lane',
    maintain: 'changes the rules, and says who uses it',
    member: 'the repositories given them',
    admin: 'every repository, the people, the plugins',
    owner: 'as an admin, and names admins and owners',
  };

  let members = $state(null);
  let everyone = $state(null);
  let lanes = $state([]);
  let signIns = $state([]);
  let failed = $state('');
  let busy = $state(false);
  // What an invitation gave: shown once.
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
    .then((said) => (signIns = said.methods ?? []))
    .catch(() => (signIns = []));

  async function act(work) {
    busy = true;
    failed = '';
    try {
      await work();
    } catch (error) {
      failed = error.message;
    }
    busy = false;
    await load();
  }

  const grant = (user, role) => act(() => ask('server.grant', { user, role }));
  const revoke = (user) => confirm(`Take ${repo} away from ${user}?`) && act(() => ask('server.grant', { user }));
  const serverRole = (user, role) => act(() => people('server.people_role', { user, role }));
  const removePerson = (user) =>
    confirm(`Remove ${user} from the server? Their token and sessions stop working.`) &&
    act(() => people('server.people_remove', { user }));

  // Somebody already on the server, given this repository.
  let adding = $state({ user: '', role: 'write' });
  function addMember(event) {
    event.preventDefault();
    const { user, role } = adding;
    if (!user.trim()) return;
    act(async () => {
      await ask('server.grant', { user: user.trim(), role });
      adding = { user: '', role: 'write' };
    });
  }

  // Somebody new: by a token, or by who they are for a way to sign in.
  let invite = $state({ user: '', email: '', way: 'token', login: '', role: 'member', repoRole: 'write' });
  function sendInvite(event) {
    event.preventDefault();
    const it = invite;
    if (!it.user.trim()) return;
    act(async () => {
      const params = { user: it.user.trim(), role: it.role };
      if (it.email.trim()) params.email = it.email.trim();
      if (it.way !== 'token') params.identity = `${it.way}:${it.login.trim()}`;
      const said = await people('server.people_add', params);
      if (repo) await ask('server.grant', { user: params.user, role: it.repoRole });
      const port = said.port ?? '7421';
      const address = `${location.hostname}:${port}/${repo ?? '<repository>'}`;
      // How the server is known: its fingerprint, or, on this machine and in the clear, --plain.
      const known = said.plain ? ' --plain' : said.fingerprint ? ` --fingerprint ${said.fingerprint}` : '';
      const line = said.token ? `kito connect ${address} --token ${said.token}${known}` : `kito connect ${address}${known}`;
      invited = { user: params.user, token: said.token, line, way: it.way };
      invite = { user: '', email: '', way: 'token', login: '', role: 'member', repoRole: 'write' };
    });
  }

  function copy(text) {
    navigator.clipboard?.writeText(text);
  }

  const openLanes = (user) => lanes.filter((lane) => lane.owner === user && lane.state !== 'closed');
  const names = $derived((everyone ?? []).map((person) => person.user).filter((name) => !members?.some((m) => m.user === name)));
</script>

<h1>{repo ? `Who uses ${repo}` : 'People of this server'}</h1>
<p class="soft">
  {#if repo}
    Each person has a role here, and nothing in the repositories they were not given. A change counts at once, in
    the connections that are open.
  {:else}
    Each person is a member, an admin or an owner of the server, and has a role in each repository they were given.
  {/if}
</p>

{#if failed}<p class="error" role="alert">{failed}</p>{/if}

{#if invited}
  <div class="panel said" role="status">
    <p><strong>{invited.user}</strong> is added.
      {#if invited.token}Their token is shown this once: pass it on now.{:else}They sign in with {invited.way}, and have no token.{/if}</p>
    <div class="line">
      <code class="mono">{invited.line}</code>
      <button onclick={() => copy(invited.line)}>Copy</button>
    </div>
    <button class="quiet" onclick={() => (invited = null)}>Done</button>
  </div>
{/if}

{#if repo}
  {#if members === null && !failed}
    <p class="soft">…</p>
  {:else if members}
    <table class="people">
      <thead><tr><th>Person</th><th>Role</th><th>Last here</th><th>Open lanes</th><th></th></tr></thead>
      <tbody>
        {#each members as member (member.user)}
          <tr>
            <td>
              <b>{member.user}</b>
              {#if member.email}<span class="faint">{member.email}</span>{/if}
              {#each member.logins ?? [] as login}<span class="chip">{login}</span>{/each}
            </td>
            <td>
              {#if member.admin}
                <span class="chip" title="An admin of the server: every repository">admin · maintain</span>
              {:else}
                <select value={member.role} disabled={busy} onchange={(event) => grant(member.user, event.currentTarget.value)} title={means[member.role]}>
                  {#each repoRoles as role}<option value={role}>{role}</option>{/each}
                </select>
              {/if}
            </td>
            <td class="soft">{member.seen_ms ? ago(member.seen_ms) : 'never'}</td>
            <td>
              {#each openLanes(member.user) as lane}
                <a class="chip" href={laneLink(lane.id)} title={lane.intent}>{lane.id.replace('lane/', '#')}</a>
              {:else}<span class="faint">none</span>{/each}
            </td>
            <td>{#if !member.admin}<button class="quiet" disabled={busy} onclick={() => revoke(member.user)}>Remove</button>{/if}</td>
          </tr>
        {/each}
      </tbody>
    </table>

    <form class="panel row" onsubmit={addMember}>
      <strong>Give {repo} to</strong>
      <input list="people-names" placeholder="name on the server" bind:value={adding.user} />
      <datalist id="people-names">{#each names as name}<option value={name}></option>{/each}</datalist>
      <span>as</span>
      <select bind:value={adding.role}>{#each repoRoles as role}<option value={role}>{role}</option>{/each}</select>
      <button class="primary" disabled={busy || !adding.user.trim()}>Give</button>
      <span class="faint">{means[adding.role]}</span>
    </form>
  {/if}
{:else if everyone}
  <table class="people">
    <thead><tr><th>Person</th><th>On the server</th><th>Repositories</th><th>Last here</th><th></th></tr></thead>
    <tbody>
      {#each everyone as person (person.user)}
        <tr>
          <td>
            <b>{person.user}</b>
            {#if person.email}<span class="faint">{person.email}</span>{/if}
            {#each person.logins ?? [] as login}<span class="chip">{login}</span>{/each}
          </td>
          <td>
            <select
              value={person.role}
              disabled={busy || (!owner && person.role !== 'member') || person.user === who.user}
              onchange={(event) => serverRole(person.user, event.currentTarget.value)}
              title={means[person.role]}
            >
              {#each serverRoles as role}<option value={role} disabled={!owner && role !== 'member'}>{role}</option>{/each}
            </select>
          </td>
          <td>
            {#if person.role !== 'member'}<span class="chip">every repository</span>{/if}
            {#each Object.entries(person.access ?? {}) as [name, role]}
              <a class="chip" href={`?repo=${encodeURIComponent(name)}#/people`}>{name} · {role}</a>
            {:else}
              {#if person.role === 'member'}<span class="faint">none given</span>{/if}
            {/each}
          </td>
          <td class="soft">{person.seen_ms ? ago(person.seen_ms) : 'never'}</td>
          <td>
            {#if person.user !== who.user && (owner || person.role === 'member')}
              <button class="quiet" disabled={busy} onclick={() => removePerson(person.user)}>Remove</button>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

{#if admin}
  <form class="panel invite" onsubmit={sendInvite}>
    <h2>Add somebody new{repo ? ` to ${repo}` : ''}</h2>
    <label>Name <input placeholder="carol" bind:value={invite.user} /></label>
    <label>Email <input placeholder="optional" bind:value={invite.email} /></label>
    <label>
      Signs in with
      <select bind:value={invite.way}>
        <option value="token">a token, shown once</option>
        {#each signIns as way}<option value={way.method}>{way.about || way.method}</option>{/each}
      </select>
    </label>
    {#if invite.way !== 'token'}
      <label>Their {invite.way} login <input placeholder="carol" bind:value={invite.login} /></label>
    {/if}
    <label>
      On the server
      <select bind:value={invite.role}>
        {#each serverRoles as role}<option value={role} disabled={!owner && role !== 'member'}>{role}</option>{/each}
      </select>
    </label>
    {#if repo}
      <label>In {repo} <select bind:value={invite.repoRole}>{#each repoRoles as role}<option value={role}>{role}</option>{/each}</select></label>
    {/if}
    <div>
      <button class="primary" disabled={busy || !invite.user.trim() || (invite.way !== 'token' && !invite.login.trim())}>Add</button>
    </div>
  </form>
{/if}

<style>
  select,
  input {
    font: inherit;
    font-size: 13px;
    color: var(--ink);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 4px 8px;
  }
  select:disabled {
    opacity: 0.6;
  }
  .people {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
  }
  .people th {
    text-align: left;
    font-size: 12px;
    font-weight: 600;
    color: var(--soft);
    padding: 6px 8px;
    border-bottom: 1px solid var(--line);
  }
  .people td {
    padding: 8px;
    border-bottom: 1px solid var(--line);
    vertical-align: middle;
  }
  .people td b {
    margin-right: 6px;
  }
  .people .chip {
    margin: 0 4px 2px 0;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 12px 16px;
  }
  .invite {
    display: grid;
    gap: 8px;
    padding: 12px 16px;
    margin-top: 16px;
    max-width: 520px;
  }
  .invite h2 {
    margin: 0 0 4px;
  }
  .invite label {
    display: grid;
    grid-template-columns: 140px 1fr;
    align-items: center;
    gap: 8px;
  }
  .said {
    padding: 12px 16px;
    margin: 12px 0;
  }
  .line {
    display: flex;
    gap: 8px;
    align-items: center;
    margin: 8px 0;
  }
  .line code {
    flex: 1;
    overflow-wrap: anywhere;
    background: var(--sunk, rgba(0, 0, 0, 0.04));
    padding: 6px 8px;
    border-radius: 6px;
  }
</style>
