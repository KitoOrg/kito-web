<script>
  import { info } from './api.js';
  import Board from './Board.svelte';
  import Lane from './Lane.svelte';

  let about = $state(null);
  let failed = $state('');
  let route = $state(location.hash);

  $effect(() => {
    const moved = () => (route = location.hash);
    addEventListener('hashchange', moved);
    return () => removeEventListener('hashchange', moved);
  });

  info()
    .then((said) => (about = said))
    .catch((error) => (failed = error.message));

  // `#/lane/3`, `#/lane/staging`; anything else is the board.
  let lane = $derived(route.match(/^#\/lane\/(.+)$/)?.[1] ?? null);

  $effect(() => {
    document.title = about?.repository ? `${lane ? `lane/${lane} · ` : ''}${about.repository} · Kito` : 'Kito';
  });
</script>

<header>
  <a class="name" href="#/">Kito</a>
  {#if about?.repository}
    <span class="repo" title={about.path}>{about.repository}</span>
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
  {:else if lane}
    {#key lane}
      <Lane {lane} />
    {/key}
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
