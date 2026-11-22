<script>
  import { behindServer, info, me, signOut } from './api.js';
  import { survey } from './needs.js';
  import Admin from './Admin.svelte';
  import Audit from './Audit.svelte';
  import Backups from './Backups.svelte';
  import Board from './Board.svelte';
  import Code from './Code.svelte';
  import Home from './Home.svelte';
  import Insights from './Insights.svelte';
  import Search from './Search.svelte';
  import Instructions from './Instructions.svelte';
  import Lane from './Lane.svelte';
  import Log from './Log.svelte';
  import Logo from './Logo.svelte';
  import Notes from './Notes.svelte';
  import People from './People.svelte';
  import Repositories from './Repositories.svelte';
  import Settings from './Settings.svelte';
  import Tasks from './Tasks.svelte';
  import SignIn from './SignIn.svelte';
  import Why from './Why.svelte';

  let about = $state(null);
  let failed = $state('');
  let route = $state(location.hash);
  // On a phone, what does not fit the bar is behind a menu button.
  let menu = $state(false);
  // The server's own pages, for its admins, and the account: each behind
  // one button of the bar.
  let drop = $state('');
  $effect(() => {
    const away = (event) => {
      if (!event.target.closest?.('.dropper')) drop = '';
    };
    addEventListener('click', away);
    return () => removeEventListener('click', away);
  });

  $effect(() => {
    const moved = () => {
      route = location.hash;
      menu = false;
      drop = '';
      scrollTo(0, 0);
    };
    addEventListener('hashchange', moved);
    return () => removeEventListener('hashchange', moved);
  });

  // Behind a server: who is signed in (null: nobody), and the
  // repository of theirs this page is about (`?repo=shop`). With none,
  // the page is the server's own: what waits for them, everywhere.
  let who = $state(null);
  let repo = $state(null);

  async function start() {
    const said = await info();
    if (said.team) {
      who = await me();
      const names = who?.repos.map((one) => one.name) ?? [];
      const asked = new URLSearchParams(location.search).get('repo');
      repo = names.includes(asked) ? asked : null;
      if (repo) {
        // Before anything asks: what follows is about this repository.
        behindServer(repo);
        said.repository = repo;
      }
      said.known = Boolean(repo);
    }
    about = said;
  }
  start().catch((error) => (failed = error.message));

  let role = $derived(who?.repos.find((one) => one.name === repo)?.role);
  // The server's own pages, whatever repository is looked at.
  const home = location.pathname;

  function choose(name) {
    location.href = name ? `${home}?repo=${encodeURIComponent(name)}#/` : home;
  }

  async function leave() {
    try {
      await signOut();
    } finally {
      location.href = home;
    }
  }

  // What waits for this person, and who is at work, across the
  // repositories they may use: looked at when the page opens, when it
  // moves to another of its pages, and every minute after.
  let seen = $state(null);
  $effect(() => {
    route;
    const repos = about?.team ? (who?.repos ?? []) : about?.known ? [{ name: about.repository, role: 'integrate' }] : [];
    if (repos.length === 0) return;
    const user = who?.user ?? null;
    const team = Boolean(about?.team);
    let stopped = false;
    const look = () =>
      survey(repos, user, team)
        .then((found) => !stopped && (seen = found))
        .catch(() => {
          // The next look may do better.
        });
    look();
    const timer = setInterval(look, 60000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  });
  let openLanes = $derived(seen?.repos.find((one) => one.name === (repo ?? about?.repository))?.lanes.length ?? null);

  // `#/lane/3` (and `?tab=changes&at=src/shop.ts` for a part of it),
  // `#/why/src%2Fshop.ts%3Atotal?lane=3`, `#/log`, `#/notes`, `#/admin`;
  // anything else is the lanes.
  let page = $derived.by(() => {
    const [path, query = ''] = route.replace(/^#\/?/, '').split('?');
    const [name, ...rest] = path.split('/');
    const asked = new URLSearchParams(query);
    if (name === 'lane' && rest.length > 0) {
      return { name: 'lane', lane: decodeURIComponent(rest.join('/')), tab: asked.get('tab') ?? 'conversation', at: asked.get('at') };
    }
    if (name === 'why' && rest.length > 0) {
      return { name: 'why', target: decodeURIComponent(rest.join('/')), lane: asked.get('lane') };
    }
    if (['why', 'log', 'notes', 'admin', 'people', 'settings', 'instructions'].includes(name)) return { name };
    if (name === 'tasks') return { name, task: asked.get('task') };
    if (name === 'search') return { name, q: asked.get('q') ?? '' };
    if (name === 'insights') return { name };
    if (name === 'audit' || name === 'backups' || name === 'repositories') return { name };
    return { name: 'lanes' };
  });
  // The part of the client a page belongs to.
  let part = $derived(page.name === 'lane' ? 'lanes' : page.name);

  $effect(() => {
    const where = page.name === 'lane' ? `lane/${page.lane} · ` : page.name === 'why' && page.target ? `${page.target} · ` : '';
    document.title = about?.repository ? `${where}${about.repository} · Kito` : 'Kito';
  });

  // Who uses a repository: for its maintainers and the server's admins.
  let mayManage = $derived(role === 'maintain' || Boolean(who?.admin));
  let parts = $derived([
    ['lanes', '#/', 'Lanes'],
    ['tasks', '#/tasks', 'Tasks'],
    ['why', '#/why', 'Code and why'],
    ['log', '#/log', 'Log'],
    ['notes', '#/notes', 'Notes'],
    ['insights', '#/insights', 'Insights'],
    ['instructions', '#/instructions', 'Instructions'],
    ...(about?.team && mayManage ? [['people', '#/people', 'People'], ['settings', '#/settings', 'Settings']] : []),
  ]);
</script>

<header class="top">
  <a class="logo" href={about?.team ? home : '#/'}><Logo /> Kito</a>
  {#if about?.team && who}
    <span class="crumb">
      <a class="host" href={home}>{location.host}</a>
      {#if who.repos.length > 0}
        <span class="slash host">/</span>
        <select aria-label="Repository" value={repo ?? ''} onchange={(event) => choose(event.currentTarget.value)}>
          <option value="">every repository</option>
          {#each who.repos as one}
            <option value={one.name}>{one.name}</option>
          {/each}
        </select>
      {/if}
    </span>
  {:else if about?.repository}
    <span class="crumb" title={about.path}><b>{about.repository}</b></span>
  {/if}
  <span class="grow"></span>
  {#if about?.team && who}
    <a class="link needs" href={home} aria-current={!repo && page.name !== 'admin' ? 'page' : undefined}>
      Needs you{#if seen?.needs.length > 0}<i>{seen.needs.length}</i>{/if}
    </a>
  {/if}
  {#if about?.known || (about?.team && who)}
    <button class="menu" aria-expanded={menu} aria-label="Menu" onclick={() => (menu = !menu)}>{menu ? '✕' : '☰'}</button>
  {/if}
  <div class="more" class:open={menu}>
  {#if about?.known || (about?.team && who)}
    <form
      class="find"
      onsubmit={(event) => {
        event.preventDefault();
        const q = new FormData(event.currentTarget).get('q') ?? '';
        location.hash = `#/search?q=${encodeURIComponent(q)}`;
        menu = false;
      }}
    >
      <input name="q" placeholder="Search what was done" aria-label="Search" />
    </form>
  {/if}
  {#if about?.team && who}
    {#if who.admin}
      {@const serverPage = ['people', 'repositories', 'admin', 'audit', 'backups'].includes(page.name) && !(page.name === 'people' && repo)}
      <div class="dropper">
        <button
          class="link toggle"
          aria-expanded={drop === 'server'}
          aria-current={serverPage ? 'page' : undefined}
          onclick={() => (drop = drop === 'server' ? '' : 'server')}>Server <span class="caret">▾</span></button
        >
        <div class="drop" class:shown={drop === 'server'}>
          <a href={`${home}#/people`} aria-current={!repo && page.name === 'people' ? 'page' : undefined}>People</a>
          <a href={`${home}#/repositories`} aria-current={page.name === 'repositories' ? 'page' : undefined}>Repositories</a>
          <a href="#/admin" aria-current={page.name === 'admin' ? 'page' : undefined}>Plugins</a>
          <a href={`${home}#/audit`} aria-current={page.name === 'audit' ? 'page' : undefined}>Audit log</a>
          <a href={`${home}#/backups`} aria-current={page.name === 'backups' ? 'page' : undefined}>Backups</a>
        </div>
      </div>
    {/if}
    <div class="dropper">
      <button class="who" title="Signed in" aria-expanded={drop === 'me'} onclick={() => (drop = drop === 'me' ? '' : 'me')}
        >{who.user}</button
      >
      <div class="drop right" class:shown={drop === 'me'}>
        <span class="faint">Signed in as <b>{who.user}</b>{who.role ? ` · ${who.role}` : ''}</span>
        <button class="out" onclick={leave}>Sign out</button>
      </div>
    </div>
  {:else if about?.kito}
    <span class="version">Kito {about.kito} · web {about.version}</span>
  {/if}
  </div>
</header>

{#if about?.known && page.name !== 'admin'}
  <nav class="tabs" aria-label="Parts of the repository">
    {#each parts as [name, href, label]}
      <a {href} aria-current={part === name ? 'page' : undefined}>
        {label}{#if name === 'lanes' && openLanes !== null}<span class="count">{openLanes}</span>{/if}
      </a>
    {/each}
    {#if role === 'read'}
      <span class="chip only" title="You may read this repository, and change nothing in it">read only</span>
    {/if}
  </nav>
{/if}

<main>
  {#if failed}
    <p class="error">{failed}</p>
  {:else if about === null}
    <p class="soft">…</p>
  {:else if about.team && !who}
    <SignIn />
  {:else if about.team && page.name === 'admin'}
    <!-- The server's own: whatever repository is looked at, or none. -->
    {#if who.admin}
      <Admin />
    {:else}
      <div class="panel closed">
        <h1>For the server’s administrators</h1>
        <p class="soft">Whoever runs this server says who they are, on its machine.</p>
      </div>
    {/if}
  {:else if about.team && ['audit', 'backups', 'repositories'].includes(page.name)}
    {#if who.admin}
      {#if page.name === 'audit'}<Audit />{:else if page.name === 'backups'}<Backups />{:else}<Repositories owner={who.role === 'owner'} />{/if}
    {:else}
      <div class="panel closed">
        <h1>For the server’s admins</h1>
        <p class="soft">The repositories, the audit log and the backups are for those who run this server.</p>
      </div>
    {/if}
  {:else if about.team && !repo && page.name === 'search'}
    {#key page.q}
      <Search team={true} repos={who.repos} q={page.q} />
    {/key}
  {:else if about.team && !repo && page.name === 'insights'}
    <Insights team={true} repos={who.repos} />
  {:else if about.team && !repo && page.name === 'people'}
    {#if who.admin}
      <People {who} />
    {:else}
      <div class="panel closed">
        <h1>For the server’s admins</h1>
        <p class="soft">The people of a repository are on its own page, for its maintainers.</p>
      </div>
    {/if}
  {:else if about.team && !repo}
    <Home {seen} {who} />
  {:else if !about.known}
    <div class="panel closed">
      <h1>This browser was not given the address</h1>
      <p class="soft">
        Open the address <code>kito web</code> printed when it started, the whole of it: it carries what lets this
        browser in, once.
      </p>
    </div>
  {:else if page.name === 'lane'}
    {#key page.lane}
      <Lane lane={page.lane} tab={page.tab} at={page.at} user={who?.user ?? null} {role} />
    {/key}
  {:else if page.name === 'why' && page.target?.includes(':')}
    <!-- A function, or some lines: all that is known of it. -->
    {#key `${page.target} ${page.lane}`}
      <Why target={page.target} lane={page.lane} />
    {/key}
  {:else if page.name === 'why'}
    <!-- The files, and one of them read with its reasons. -->
    {#key `${page.target ?? ''} ${page.lane ?? ''}`}
      <Code file={page.target ?? null} lane={page.lane ?? null} />
    {/key}
  {:else if page.name === 'search'}
    {#key page.q}
      <Search {repo} team={Boolean(about.team)} q={page.q} />
    {/key}
  {:else if page.name === 'insights'}
    {#key repo}
      <Insights {repo} team={Boolean(about.team)} />
    {/key}
  {:else if page.name === 'tasks'}
    {#key `${repo} ${page.task}`}
      <Tasks {role} user={who?.user ?? null} open={page.task} />
    {/key}
  {:else if page.name === 'instructions'}
    {#key repo}
      <Instructions {repo} {who} {role} />
    {/key}
  {:else if page.name === 'settings' && about.team && mayManage}
    {#key repo}
      <Settings {repo} {who} />
    {/key}
  {:else if page.name === 'people' && about.team && mayManage}
    {#key repo}
      <People {repo} {who} />
    {/key}
  {:else if page.name === 'log'}
    <Log />
  {:else if page.name === 'notes'}
    <Notes />
  {:else}
    <Board user={who?.user ?? null} {role} />
  {/if}
</main>

<style>
  .top {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 20px;
    background: var(--chrome);
    color: var(--chrome-ink);
    flex-wrap: wrap;
  }
  .top a {
    color: inherit;
  }
  .logo {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    font-size: 17px;
    letter-spacing: -0.01em;
    /* The mark's own colour, on the dark bar. */
    --mark: var(--on-chrome);
  }
  .logo:hover {
    text-decoration: none;
  }
  .crumb {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--mono);
    font-size: 13px;
  }
  .slash {
    opacity: 0.5;
  }
  select {
    font: inherit;
    font-weight: 600;
    color: inherit;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 6px;
    padding: 2px 6px;
  }
  select option {
    color: var(--ink);
    background: var(--panel);
  }
  .grow {
    flex: 1;
  }
  .more {
    display: contents;
  }
  .menu {
    display: none;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.08);
    color: inherit;
    border-radius: 6px;
    width: 34px;
    height: 32px;
    font-size: 16px;
    line-height: 1;
  }
  .find input {
    font: inherit;
    font-size: 13px;
    color: inherit;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 6px;
    padding: 3px 8px;
    width: 150px;
  }
  .link {
    font-size: 13px;
    padding: 3px 10px;
    border-radius: 6px;
    opacity: 0.85;
  }
  .link:hover {
    text-decoration: none;
    opacity: 1;
  }
  .link[aria-current='page'] {
    background: rgba(255, 255, 255, 0.12);
    opacity: 1;
    font-weight: 600;
  }
  .link i {
    font-style: normal;
    font-size: 11px;
    font-weight: 700;
    margin-left: 6px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--accent);
    color: var(--accent-ink);
    font-variant-numeric: tabular-nums;
  }
  .dropper {
    position: relative;
  }
  .toggle {
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  .caret {
    font-size: 10px;
    opacity: 0.7;
  }
  .drop {
    display: none;
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    min-width: 180px;
    flex-direction: column;
    padding: 6px;
    background: var(--panel);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.25);
    z-index: 30;
  }
  .drop.right {
    left: auto;
    right: 0;
  }
  .drop.shown {
    display: flex;
  }
  .drop a {
    padding: 7px 10px;
    border-radius: 6px;
    font-size: 13px;
    color: var(--ink);
  }
  .drop a:hover {
    background: var(--bg);
    text-decoration: none;
  }
  .drop a[aria-current='page'] {
    font-weight: 600;
    color: var(--accent);
  }
  .drop > span {
    padding: 7px 10px;
    font-size: 12px;
  }
  .drop .out {
    color: var(--ink);
    text-align: left;
    padding: 7px 10px;
    border-radius: 6px;
    opacity: 1;
  }
  .drop .out:hover {
    background: var(--bg);
  }
  .who {
    border: 0;
    color: inherit;
    font: inherit;
    cursor: pointer;
    display: inline-grid;
    place-items: center;
    min-width: 26px;
    height: 26px;
    padding: 0 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.14);
    font-size: 12px;
    font-weight: 600;
  }
  .out {
    font-size: 13px;
    border: 0;
    background: none;
    color: inherit;
    opacity: 0.75;
    padding: 2px 4px;
  }
  .out:hover {
    opacity: 1;
  }
  .version {
    font-size: 12px;
    opacity: 0.7;
  }
  .tabs {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 20px;
    background: var(--panel);
    border-bottom: 1px solid var(--line);
    overflow-x: auto;
  }
  .tabs a {
    padding: 10px 12px;
    color: var(--soft);
    font-size: 14px;
    white-space: nowrap;
    border-bottom: 2px solid transparent;
  }
  .tabs a:hover {
    text-decoration: none;
    color: var(--ink);
  }
  .tabs a[aria-current='page'] {
    color: var(--ink);
    font-weight: 600;
    border-color: var(--accent);
  }
  .count {
    margin-left: 6px;
    padding: 0 7px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--bg);
    font-size: 12px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .only {
    margin-left: auto;
  }
  main {
    max-width: 1180px;
    margin: 0 auto;
    padding: 20px;
  }
  .closed {
    padding: 24px;
    max-width: 560px;
  }
  .closed p {
    margin: 8px 0 0;
  }
  @media (max-width: 760px) {
    .top {
      padding: 8px 12px;
      gap: 8px;
      flex-wrap: nowrap;
      position: sticky;
      top: 0;
      z-index: 20;
    }
    .logo {
      font-size: 0;
      gap: 0;
    }
    .host {
      display: none;
    }
    .crumb {
      min-width: 0;
    }
    select {
      max-width: 46vw;
      padding: 4px 6px;
    }
    .needs {
      white-space: nowrap;
      padding: 5px 8px;
    }
    .menu {
      display: inline-grid;
      place-items: center;
      flex: none;
    }
    .more {
      display: none;
    }
    .more.open {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 2px;
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      padding: 10px 12px 14px;
      background: var(--chrome);
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 12px 24px rgba(0, 0, 0, 0.35);
    }
    .more.open .find input {
      width: 100%;
      padding: 8px 10px;
      font-size: 15px;
      margin-bottom: 6px;
    }
    .more.open .link {
      font-size: 15px;
      padding: 10px;
    }
    .more.open .who {
      justify-self: start;
      margin: 8px 0 0 10px;
      width: max-content;
    }
    .more.open .out {
      text-align: left;
      font-size: 15px;
      padding: 10px;
    }
    .more.open .toggle,
    .more.open .who {
      display: none;
    }
    .more.open .drop {
      display: flex;
      position: static;
      background: none;
      border: 0;
      box-shadow: none;
      padding: 0;
      color: inherit;
    }
    .more.open .drop a,
    .more.open .drop .out {
      color: inherit;
      font-size: 15px;
      padding: 10px;
    }
  }
  @media (max-width: 640px) {
    .tabs {
      padding: 0 8px;
    }
    main {
      padding: 14px;
    }
  }
</style>
