<script>
  import { behindServer, info, me, signOut } from './api.js';
  import { survey } from './needs.js';
  import { shell } from './shell.svelte.js';
  import Account from './Account.svelte';
  import Admin from './Admin.svelte';
  import Audit from './Audit.svelte';
  import Backups from './Backups.svelte';
  import Board from './Board.svelte';
  import Code from './Code.svelte';
  import Empty from './Empty.svelte';
  import Err from './Err.svelte';
  import Home from './Home.svelte';
  import Icon from './Icon.svelte';
  import Insights from './Insights.svelte';
  import Kitchens from './Kitchens.svelte';
  import Search from './Search.svelte';
  import Instructions from './Instructions.svelte';
  import Lane from './Lane.svelte';
  import Log from './Log.svelte';
  import Logo from './Logo.svelte';
  import NoAccess from './NoAccess.svelte';
  import Notes from './Notes.svelte';
  import PageHead from './PageHead.svelte';
  import People from './People.svelte';
  import Repositories from './Repositories.svelte';
  import Settings from './Settings.svelte';
  import Tasks from './Tasks.svelte';
  import SignIn from './SignIn.svelte';
  import Loading from './Loading.svelte';
  import Toasts from './Toasts.svelte';
  import Why from './Why.svelte';

  let about = $state(null);
  let failed = $state('');
  let route = $state(location.hash);
  // On a phone, what does not fit the bar is behind a menu button.
  let menu = $state(false);
  // The server's own pages and the account: each behind one button of the bar.
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
      // Back from linking an account at its provider: the page that was left.
      const left = sessionStorage.getItem('kito-back');
      sessionStorage.removeItem('kito-back');
      if (left && who) {
        location.hash = left;
        route = left;
      }
    }
    // What the head of each page says after its own name.
    shell.repo = said.repository ?? null;
    about = said;
  }
  start().catch((error) => (failed = error.message));

  // A repository was added, a plugin enabled: who is signed in, what they
  // may use and what runs on the server are asked for again.
  let asked = 0;
  $effect(() => {
    if (shell.stale === asked) return;
    asked = shell.stale;
    me()
      .then((now) => now && (who = now))
      .catch(() => {
        // What the page has stays.
      });
  });

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
    if (name === 'audit' || name === 'backups' || name === 'repositories' || name === 'account') return { name };
    if (name === 'kitchens') return { name, k: asked.get('k') };
    return { name: 'lanes' };
  });
  // The part of the client a page belongs to.
  let part = $derived(page.name === 'lane' ? 'lanes' : page.name);

  // Who uses a repository: for its maintainers and the server's admins.
  let mayManage = $derived(role === 'maintain' || Boolean(who?.admin));
  // The plugins that run on the server (Kito 0.36.2); one that does not say runs them all.
  let running = $derived((name) => who?.plugins === undefined || who.plugins.includes(name));
  // The parts of a repository: each is a tab, and the title of its page.
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
  // The server's own pages: for everybody what everybody may read, for its
  // admins the rest. Each is an entry of the Server menu, and the title of
  // its page.
  let serverPages = $derived(
    !about?.team || !who
      ? []
      : [
          ...(who.admin ? [['people', 'People'], ['repositories', 'Repositories']] : []),
          ...(running('kitchen') ? [['kitchens', 'Kitchens']] : []),
          ...(who.admin ? [['admin', 'Plugins']] : []),
          ['insights', 'Insights'],
          ...(who.admin ? [['audit', 'Audit log'], ['backups', 'Backups']] : []),
        ],
  );
  let onServerPage = $derived(!repo && serverPages.some(([name]) => name === page.name));
</script>

<header class="top">
  <div class="wrap bar">
    <a class="logo" href={about?.team ? home : '#/'}><Logo /> Kito</a>
    {#if about?.team && who}
      <span class="crumb">
        <a class="host mono" href={home}>{location.host}</a>
        {#if who.repos.length > 0}
          <span class="host">/</span>
          <select aria-label="Repository" value={repo ?? ''} onchange={(event) => choose(event.currentTarget.value)}>
            <option value="">Every repository</option>
            {#each who.repos as one}
              <option value={one.name}>{one.name}</option>
            {/each}
          </select>
        {/if}
      </span>
    {:else if about?.repository}
      <span class="crumb"><b>{about.repository}</b></span>
    {/if}
    <span class="grow"></span>
    {#if about?.team && who}
      <a class="link needs" href={home} aria-current={!repo && page.name === 'lanes' ? 'page' : undefined}>
        Needs you{#if seen?.needs.length > 0}<span class="count chrome">{seen.needs.length}</span>{/if}
      </a>
    {/if}
    {#if about?.known || (about?.team && who)}
      <button class="bare menu" aria-expanded={menu} aria-label="Menu" onclick={() => (menu = !menu)}>
        <Icon name={menu ? 'close' : 'menu'} />
      </button>
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
          <input name="q" placeholder="Search what was done" aria-label="Search what was done" />
        </form>
      {/if}
      {#if about?.team && who}
        {#if serverPages.length > 0}
          <div class="dropper">
            <button
              class="bare link toggle"
              aria-expanded={drop === 'server'}
              aria-current={onServerPage ? 'page' : undefined}
              onclick={() => (drop = drop === 'server' ? '' : 'server')}>Server <Icon name="chevron-down" size={12} /></button
            >
            <div class="drop" class:shown={drop === 'server'}>
              {#each serverPages as [name, label]}
                <a href={`${home}#/${name}`} aria-current={!repo && page.name === name ? 'page' : undefined}>{label}</a>
              {/each}
            </div>
          </div>
        {/if}
        <div class="dropper">
          <button class="bare who" aria-label={`Signed in as ${who.user}`} aria-expanded={drop === 'me'} onclick={() => (drop = drop === 'me' ? '' : 'me')}
            >{who.user}</button
          >
          <div class="drop right" class:shown={drop === 'me'}>
            <span class="signed small">Signed in as <b>{who.user}</b>{who.role ? `, ${who.role} of this server` : ''}</span>
            <a href={`${home}#/account`} aria-current={page.name === 'account' ? 'page' : undefined}>Account</a>
            <button class="bare out" onclick={leave}>Sign out</button>
          </div>
        </div>
      {:else if about?.kito}
        <span class="version small">Kito {about.kito} · web {about.version}</span>
      {/if}
    </div>
  </div>
</header>

{#if about?.known}
  <nav class="tabs" aria-label="Parts of the repository">
    <div class="wrap bar">
      {#each parts as [name, href, label]}
        <a {href} aria-current={part === name ? 'page' : undefined}>
          {label}{#if name === 'lanes' && openLanes !== null}<span class="count">{openLanes}</span>{/if}
        </a>
      {/each}
      {#if role === 'read'}
        <span class="chip only">read only</span>
      {/if}
    </div>
  </nav>
{/if}

<main class="wrap">
  {#if failed}
    <Err message={failed} />
  {:else if about === null}
    <Loading />
  {:else if about.team && !who}
    <SignIn />
  {:else if about.team && ['admin', 'audit', 'backups', 'repositories'].includes(page.name)}
    <!-- The server's own, for its admins: whatever repository is looked at, or none. -->
    {#if !who.admin}
      <NoAccess title={serverTitle(page.name)} />
    {:else if page.name === 'admin'}
      <Admin />
    {:else if page.name === 'audit'}
      <Audit />
    {:else if page.name === 'backups'}
      <Backups />
    {:else}
      <Repositories owner={who.role === 'owner'} />
    {/if}
  {:else if about.team && page.name === 'account'}
    <!-- One's own: how one signs in, whatever repository is looked at. -->
    <Account {who} />
  {:else if about.team && page.name === 'kitchens'}
    <!-- The server's own, for whoever signed in: each sees the kitchens they may read. -->
    {#if running('kitchen')}
      {#key page.k}
        <Kitchens {who} k={page.k} />
      {/key}
    {:else}
      <PageHead title="Kitchens" />
      <Empty title="No kitchen plugin on this server">An admin enables it on the <a href={`${home}#/admin`}>Plugins</a> page.</Empty>
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
      <NoAccess title="People" />
    {/if}
  {:else if about.team && !repo}
    <Home {seen} {who} />
  {:else if !about.known}
    <Empty title="This browser has no access">Open the whole address <code>kito web</code> printed.</Empty>
  {:else if page.name === 'lane'}
    {#key page.lane}
      <Lane lane={page.lane} tab={page.tab} at={page.at} user={who?.user ?? null} {role} />
    {/key}
  {:else if page.name === 'why' && page.target?.includes(':')}
    <!-- A function, or some lines: all that is known of it. -->
    {#key `${page.target} ${page.lane}`}
      <Why target={page.target} lane={page.lane} {role} />
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
    {#key repo}
      <Tasks {role} user={who?.user ?? null} open={page.task} />
    {/key}
  {:else if page.name === 'instructions'}
    {#key repo}
      <Instructions {repo} {who} {role} />
    {/key}
  {:else if (page.name === 'settings' || page.name === 'people') && about.team}
    <!-- For the repository's maintainers and the server's admins. -->
    {#if !mayManage}
      <NoAccess title={page.name === 'settings' ? 'Settings' : 'People'} who="maintainers" />
    {:else if page.name === 'settings'}
      {#key repo}
        <Settings {repo} {who} />
      {/key}
    {:else}
      {#key repo}
        <People {repo} {who} />
      {/key}
    {/if}
  {:else if page.name === 'log'}
    <Log />
  {:else if page.name === 'notes'}
    <Notes {role} />
  {:else}
    <Board user={who?.user ?? null} {role} />
  {/if}
</main>

<Toasts />

<script module>
  // The title of each of the server's own pages: the words of its menu entry.
  const SERVER_TITLES = { admin: 'Plugins', audit: 'Audit log', backups: 'Backups', repositories: 'Repositories' };
  const serverTitle = (name) => SERVER_TITLES[name] ?? name;
</script>

<style>
  /* The bar is dark in both themes: what is on it is drawn for it. */
  .top {
    background: var(--chrome);
    color: var(--chrome-ink);
  }
  .bar {
    display: flex;
    align-items: center;
  }
  .top .bar {
    gap: 12px;
    min-height: 48px;
    padding-block: 8px;
    flex-wrap: wrap;
  }
  .top a {
    color: inherit;
  }
  .logo {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    font-size: 15px;
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
    min-width: 0;
  }
  .host {
    color: var(--chrome-soft);
  }
  .top select,
  .find input {
    height: var(--control-sm);
    color: inherit;
    background: var(--chrome-fill);
    border-color: var(--chrome-line);
  }
  .top select {
    font-weight: 500;
    padding: 0 6px;
  }
  .top select option {
    color: var(--ink);
    background: var(--panel);
  }
  .top select:focus,
  .find input:focus {
    border-color: var(--on-chrome);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--on-chrome) 25%, transparent);
  }
  .more {
    display: contents;
  }
  .menu {
    display: none;
    place-items: center;
    width: var(--control);
    height: var(--control);
    border: 1px solid var(--chrome-line);
    border-radius: var(--radius);
    background: var(--chrome-fill);
    color: inherit;
    cursor: pointer;
  }
  .find input {
    width: 200px;
  }
  .find input::placeholder {
    color: var(--chrome-soft);
  }
  .link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: var(--control-sm);
    padding: 0 10px;
    border-radius: var(--radius);
    font-weight: 500;
    color: inherit;
    cursor: pointer;
  }
  .link:hover {
    text-decoration: none;
    background: var(--chrome-fill);
  }
  .link[aria-current='page'] {
    background: var(--chrome-fill-strong);
  }
  .dropper {
    position: relative;
  }
  .drop {
    display: none;
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    min-width: 190px;
    flex-direction: column;
    padding: 4px;
    background: var(--panel);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: var(--radius-panel);
    box-shadow: var(--menu-shadow);
    z-index: 30;
  }
  .drop.right {
    left: auto;
    right: 0;
  }
  .drop.shown {
    display: flex;
  }
  .drop a,
  .drop .out {
    display: flex;
    align-items: center;
    height: var(--control);
    padding: 0 10px;
    border-radius: var(--radius);
    color: var(--ink);
    cursor: pointer;
  }
  .drop a:hover,
  .drop .out:hover {
    background: var(--hover);
    text-decoration: none;
  }
  .drop a[aria-current='page'] {
    font-weight: 600;
    color: var(--accent);
  }
  .signed {
    padding: 8px 10px;
    margin-bottom: 4px;
    border-bottom: 1px solid var(--line);
    color: var(--soft);
    white-space: nowrap;
  }
  .who {
    display: inline-grid;
    place-items: center;
    min-width: var(--control-sm);
    height: var(--control-sm);
    padding: 0 10px;
    border-radius: 999px;
    background: var(--chrome-fill-strong);
    color: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .who:hover {
    background: var(--chrome-line);
  }
  .version {
    color: var(--chrome-soft);
  }
  .tabs {
    background: var(--panel);
    border-bottom: 1px solid var(--line);
  }
  .tabs .bar {
    gap: 2px;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .tabs a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 42px;
    padding: 0 10px;
    color: var(--soft);
    font-weight: 500;
    white-space: nowrap;
    border-bottom: 2px solid transparent;
  }
  /* The first tab's words start where the page's do. */
  .tabs a:first-child {
    margin-left: -10px;
  }
  .tabs a:hover {
    text-decoration: none;
    color: var(--ink);
  }
  .tabs a[aria-current='page'] {
    color: var(--ink);
    border-color: var(--accent);
  }
  .only {
    margin-left: auto;
  }
  main {
    padding-block: 24px;
  }
  @media (max-width: 760px) {
    .top {
      position: sticky;
      top: 0;
      z-index: 20;
    }
    .top .bar {
      gap: 8px;
      flex-wrap: nowrap;
      padding-block: 6px;
    }
    .logo {
      font-size: 0;
      gap: 0;
    }
    .host {
      display: none;
    }
    .top select {
      max-width: 46vw;
      height: var(--control);
    }
    .needs {
      white-space: nowrap;
      height: var(--control);
    }
    .menu {
      display: inline-grid;
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
      padding: 10px 16px 14px;
      background: var(--chrome);
      border-top: 1px solid var(--chrome-line);
      box-shadow: var(--menu-shadow);
    }
    .more.open .find input {
      width: 100%;
      height: 40px;
      margin-bottom: 6px;
    }
    .more.open .link,
    .more.open .drop a,
    .more.open .drop .out {
      height: 40px;
      color: inherit;
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
    .more.open .signed {
      border-color: var(--chrome-line);
      color: var(--chrome-soft);
    }
    .more.open .drop a:hover,
    .more.open .drop .out:hover {
      background: var(--chrome-fill);
    }
  }
  @media (max-width: 640px) {
    main {
      padding-block: 16px;
    }
  }
</style>
