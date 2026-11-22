<script>
  // Behind a server, for somebody it does not know yet: the ways to sign
  // in that its plugins offer, and a token for those who were given one.
  import { openSession, ways } from './api.js';
  import Err from './Err.svelte';
  import PageHead from './PageHead.svelte';

  let methods = $state([]);
  let token = $state('');
  let failed = $state('');
  let busy = $state(false);

  // A way that is not set up yet is not offered at all; a server that does
  // not say whether one is ready offers them as it always did.
  ways()
    .then((said) => (methods = (said.methods ?? []).filter((way) => way.ready !== false)))
    .catch(() => {
      // A server without them still takes a token.
    });

  async function enter() {
    busy = true;
    failed = '';
    try {
      await openSession(token.trim());
      location.reload();
    } catch (error) {
      failed = error.message;
      busy = false;
    }
  }
</script>

<div class="narrow">
  <PageHead
    title="Sign in"
    lead={`${methods.length > 0 ? 'With one of the ways this server offers, or with a token it gave you.' : 'With the token this server gave you.'} Who may use which repository is decided by whoever runs it.`}
  />
  <div class="stack">
    {#if methods.length > 0}
      <div class="controls">
        {#each methods as way}
          <a class="button" href={way.path}>{way.about || `Sign in with ${way.method}`}</a>
        {/each}
      </div>
    {/if}
    <form
      class="panel pad form"
      onsubmit={(event) => {
        event.preventDefault();
        enter();
      }}
    >
      <label class="field">
        <span>Token</span>
        <input type="password" autocomplete="off" placeholder="kito_…" bind:value={token} />
      </label>
      <div class="controls">
        <button class="primary" disabled={busy || token.trim() === ''}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </div>
      <Err message={failed} />
    </form>
  </div>
</div>
