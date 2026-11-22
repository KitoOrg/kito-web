<script>
  // How one person signs in to the server, and what changes it: a token,
  // an account for each way the server's plugins offer, or both; never
  // nothing. `user`: whose it is (null: one's own, who links an account
  // by signing in to it; an admin names the login of somebody else's).
  // The server decides what is allowed: what it refuses is said under
  // the list.
  import { focus, people } from './api.js';
  import { toast } from './toast.svelte.js';
  import Confirm from './Confirm.svelte';
  import CopyLine from './CopyLine.svelte';
  import Err from './Err.svelte';
  import Icon from './Icon.svelte';

  // `has`: `{ token, logins }` as the server says it; `ways`: the ways to
  // sign in that are set up; `title`, `onclose`: when it is a panel that
  // opens over a list of people; `onchange`: called after each change.
  let { user = null, has, ways = [], title = null, onclose = null, onchange = null } = $props();

  const own = $derived(user === null);
  const whose = $derived(own ? {} : { user });
  const logins = $derived(has.logins ?? []);
  // The one way somebody has to sign in stays: nothing takes it away.
  const several = $derived((has.token ? 1 : 0) + logins.length > 1);
  const loginOf = (method) => logins.find((login) => login.startsWith(`${method}:`)) ?? null;

  let busy = $state(false);
  let wrong = $state('');
  // A new token, said this once: it stays on the page until it is closed.
  let fresh = $state(null);
  // The login typed for each way, by whoever links somebody else's account.
  let typed = $state({});

  async function change(work) {
    busy = true;
    wrong = '';
    try {
      await work();
      await onchange?.();
    } catch (error) {
      wrong = error.message;
    }
    busy = false;
  }

  const renew = () =>
    change(async () => {
      fresh = (await people('server.people_token', whose)).token;
    });
  const removeToken = () =>
    change(async () => {
      await people('server.people_token', { ...whose, remove: true });
      fresh = null;
      toast('Token removed');
    });
  const unlink = (method) =>
    change(async () => {
      await people('server.people_unlink', { ...whose, method });
      toast(`${method} unlinked`);
    });
  const link = (method) =>
    change(async () => {
      await people('server.people_link', { user, identity: `${method}:${typed[method].trim()}` });
      typed[method] = '';
      toast(`${method} linked`);
    });

  // One's own account is linked at its provider: the way back leads here.
  const leave = () => sessionStorage.setItem('kito-back', location.hash);

  const ends = $derived(own ? 'your other sessions end' : 'their sessions end');
</script>

<!-- Opened over a list, it keeps its distance from it as a form does. -->
<div class={['stack', 'narrow', title && 'form']}>
  <div class="panel">
    {#if title}
      <div class="panel-head">
        <h3>{title}</h3>
        <span class="grow"></span>
        <!-- Where the page goes when it opens: it may be far from the row that opened it. -->
        <button use:focus class="quiet sm icon" aria-label="Close" onclick={onclose}><Icon name="close" /></button>
      </div>
    {/if}
    <ul class="rows">
      <li>
        <div class="row way">
          <div class="row-body">
            <span class="row-title">Token</span>
            <span class="row-meta">
              {#if has.token}In use{:else}<span class="none">None</span>{/if}
            </span>
          </div>
          <div class="row-side">
            {#if has.token}
              <Confirm
                sm
                quiet={false}
                danger={false}
                label="New token"
                ask={`New token${own ? '' : ` for ${user}`}? The one in use stops working, and ${ends}.`}
                disabled={busy}
                onyes={renew}
              />
              {#if several}
                <Confirm
                  sm
                  label="Remove"
                  ask={`Remove ${own ? 'your' : `${user}’s`} token? It stops working, and ${ends}.`}
                  disabled={busy}
                  onyes={removeToken}
                />
              {/if}
            {:else}
              <button class="sm" disabled={busy} onclick={renew}>New token</button>
            {/if}
          </div>
        </div>
      </li>
      {#each ways as way (way.method)}
        {@const login = loginOf(way.method)}
        <li>
          <div class="row way">
            <div class="row-body">
              <span class="row-title">{way.method}</span>
              <span class="row-meta">
                {#if login}{login}{:else}<span class="none">None</span>{/if}
              </span>
            </div>
            <div class="row-side">
              {#if login}
                {#if several}
                  <Confirm
                    sm
                    label="Unlink"
                    ask={`Unlink ${login}? It no longer signs ${own ? 'you' : user} in, and ${ends}.`}
                    disabled={busy}
                    onyes={() => unlink(way.method)}
                  />
                {/if}
              {:else if own}
                <a class="button sm" href={`${way.path}?link=1`} onclick={leave}>Link</a>
              {:else}
                <form
                  class="controls"
                  onsubmit={(event) => {
                    event.preventDefault();
                    link(way.method);
                  }}
                >
                  <input class="sm" placeholder="Their login" aria-label={`Login of ${user} for ${way.method}`} bind:value={typed[way.method]} />
                  <button class="sm" disabled={busy || !typed[way.method]?.trim()}>Link</button>
                </form>
              {/if}
            </div>
          </div>
        </li>
      {/each}
    </ul>
  </div>
  {#if fresh}
    <div class="result" role="status">
      <div class="controls">
        <p class="grow">{own ? 'Your new token' : `The new token of ${user}`} is shown this once.</p>
        <button class="quiet sm icon" aria-label="Close" onclick={() => (fresh = null)}><Icon name="close" /></button>
      </div>
      <CopyLine text={fresh} />
    </div>
  {/if}
  <Err message={wrong} />
</div>

<style>
  /* A way and what is done to it, on one line where there is room. */
  .way {
    align-items: center;
    flex-wrap: wrap;
  }
</style>
