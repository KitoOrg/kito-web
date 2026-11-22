<script>
  import Logo from './Logo.svelte';
  // Behind a server, for somebody it does not know yet: the ways to sign
  // in that its plugins offer, and a token for those who were given one.
  import { openSession, ways } from './api.js';

  let methods = $state([]);
  let token = $state('');
  let failed = $state('');
  let busy = $state(false);

  ways()
    .then((said) => (methods = said.methods ?? []))
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

<div class="panel signin">
  <h1><Logo size={28} /> Sign in to Kito</h1>
  {#if methods.length > 0}
    <div class="ways">
      {#each methods as way}
        <a class="way" href={way.path}>{way.about || `Sign in with ${way.method}`}</a>
      {/each}
    </div>
  {/if}
  <form
    onsubmit={(event) => {
      event.preventDefault();
      enter();
    }}
  >
    <label class="field"
      >{methods.length > 0 ? 'Or with a token of this server' : 'With the token this server gave you'}
      <input type="password" bind:value={token} autocomplete="off" placeholder="kito_…" /></label
    >
    <button class="primary" disabled={busy || token.trim() === ''}>Sign in</button>
  </form>
  {#if failed}
    <p class="error">{failed}</p>
  {/if}
  <p class="faint">Who may use which repository is decided by whoever runs this server.</p>
</div>

<style>
  .signin {
    padding: 28px;
    max-width: 400px;
    margin: 64px auto 0;
    display: grid;
    gap: 20px;
  }
  h1 {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .ways {
    display: grid;
    gap: 8px;
  }
  .way {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: var(--control);
    padding: 0 12px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--panel);
    color: var(--ink);
    font-size: 13px;
    font-weight: 500;
  }
  .way:hover {
    text-decoration: none;
    background: var(--hover);
  }
  form {
    display: grid;
    gap: 12px;
  }
  label {
    color: var(--soft);
    font-weight: 400;
  }
  p {
    margin: 0;
    font-size: 12.5px;
  }
  @media (max-width: 640px) {
    .signin {
      margin-top: 24px;
      padding: 20px;
    }
  }
</style>
