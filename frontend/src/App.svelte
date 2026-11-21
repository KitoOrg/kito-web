<script>
  import { info } from './api.js';
  import Board from './Board.svelte';
  import Code from './Code.svelte';
  import Lane from './Lane.svelte';
  import Log from './Log.svelte';
  import Notes from './Notes.svelte';
  import Why from './Why.svelte';

  let about = $state(null);
  let failed = $state('');
  let route = $state(location.hash);

  $effect(() => {
    const moved = () => {
      route = location.hash;
      scrollTo(0, 0);
    };
    addEventListener('hashchange', moved);
    return () => removeEventListener('hashchange', moved);
  });

  info()
    .then((said) => (about = said))
    .catch((error) => (failed = error.message));

  // `#/lane/3`, `#/why/src%2Fshop.ts%3Atotal?lane=3`, `#/log`, `#/notes`;
  // anything else is the lanes.
  let page = $derived.by(() => {
    const [path, query = ''] = route.replace(/^#\/?/, '').split('?');
    const [name, ...rest] = path.split('/');
    const asked = new URLSearchParams(query);
    if (name === 'lane' && rest.length > 0) return { name: 'lane', lane: decodeURIComponent(rest.join('/')) };
    if (name === 'why' && rest.length > 0) {
      return { name: 'why', target: decodeURIComponent(rest.join('/')), lane: asked.get('lane') };
    }
    if (['why', 'log', 'notes'].includes(name)) return { name };
    return { name: 'lanes' };
  });
  // The part of the client a page belongs to.
  let part = $derived(page.name === 'lane' ? 'lanes' : page.name);

  $effect(() => {
    const where = page.name === 'lane' ? `lane/${page.lane} · ` : page.name === 'why' && page.target ? `${page.target} · ` : '';
    document.title = about?.repository ? `${where}${about.repository} · Kito` : 'Kito';
  });

  const parts = [
    ['lanes', '#/', 'Lanes'],
    ['why', '#/why', 'Why'],
    ['log', '#/log', 'Log'],
    ['notes', '#/notes', 'Notes'],
  ];
</script>

<header>
  <a class="name" href="#/">Kito</a>
  {#if about?.repository}
    <span class="repo" title={about.path}>{about.repository}</span>
  {/if}
  {#if about?.known}
    <nav aria-label="Parts">
      {#each parts as [name, href, label]}
        <a {href} aria-current={part === name ? 'page' : undefined}>{label}</a>
      {/each}
    </nav>
  {/if}
  <span class="grow"></span>
  {#if about?.kito}
    <span class="faint version">Kito {about.kito} · web {about.version}</span>
  {/if}
</header>

<main>
  {#if failed}
    <p class="error">{failed}</p>
  {:else if about === null}
    <p class="soft">…</p>
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
      <Lane lane={page.lane} />
    {/key}
  {:else if page.name === 'why' && page.target}
    {#key `${page.target} ${page.lane}`}
      <Why target={page.target} lane={page.lane} />
    {/key}
  {:else if page.name === 'why'}
    <Code />
  {:else if page.name === 'log'}
    <Log />
  {:else if page.name === 'notes'}
    <Notes />
  {:else}
    <Board />
  {/if}
</main>

<style>
  header {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 12px 24px;
    border-bottom: 1px solid var(--line);
    background: var(--panel);
    flex-wrap: wrap;
  }
  .name {
    font-weight: 700;
    font-size: 17px;
    color: var(--ink);
  }
  .repo {
    font-family: var(--mono);
    font-size: 13px;
    color: var(--soft);
  }
  nav {
    display: flex;
    gap: 4px;
    margin-left: 12px;
  }
  nav a {
    padding: 2px 10px;
    border-radius: 6px;
    color: var(--soft);
    font-size: 14px;
  }
  nav a:hover {
    text-decoration: none;
    color: var(--ink);
  }
  nav a[aria-current='page'] {
    background: var(--bg);
    color: var(--ink);
    font-weight: 600;
  }
  .grow {
    flex: 1;
  }
  .version {
    font-size: 12px;
  }
  main {
    max-width: 1080px;
    margin: 0 auto;
    padding: 24px;
  }
  .closed {
    padding: 24px;
    max-width: 560px;
  }
  .closed p {
    margin: 8px 0 0;
  }
</style>
