<script>
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
  <h1>Sign in</h1>
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
    <label
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
    padding: 24px;
    max-width: 420px;
    margin: 48px auto 0;
    display: grid;
    gap: 16px;
  }
  h1 {
    margin: 0;
  }
  .ways {
    display: grid;
    gap: 8px;
  }
  .way {
    display: block;
    text-align: center;
    padding: 8px 12px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--bg);
    color: var(--ink);
    font-weight: 600;
  }
  .way:hover {
    text-decoration: none;
    border-color: var(--soft);
  }
  form {
    display: grid;
    gap: 8px;
  }
  label {
    display: grid;
    gap: 4px;
    font-size: 13px;
    color: var(--soft);
  }
  input {
    font: inherit;
    padding: 6px 8px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--panel);
    color: var(--ink);
  }
  p {
    margin: 0;
    font-size: 13px;
  }
</style>
