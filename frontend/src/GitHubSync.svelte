<script>
  // A repository kept in step with one at GitHub (kito-github 0.4, on Kito
  // 0.39): which one, the branch the main lane is, code and issues on or
  // off, how the last sync went, and Sync now. The plugin answers under
  // /github: what it keeps is its own.
  import { ago } from './api.js';
  import { toast } from './toast.svelte.js';
  import Loading from './Loading.svelte';

  let { repo, admin = false } = $props();

  let state = $state(null);
  let choices = $state(null);
  let failed = $state('');
  let busy = $state(false);

  // What is being chosen.
  let github = $state('');
  let branch = $state('main');
  let code = $state(true);
  let issues = $state(true);
  let org = $state('');

  const base = `/github/api/${encodeURIComponent(repo)}`;

  async function call(what, body) {
    const response = await fetch(`${base}/${what}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const said = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(said.error ?? `the GitHub plugin answered ${response.status}`);
    return said;
  }

  async function load() {
    try {
      state = await call('status');
      const link = state.link;
      if (link) {
        github = link.github;
        branch = link.branch || 'main';
        code = link.code;
        issues = link.issues;
      }
      failed = '';
      if (state.app && state.may_change && choices === null) {
        call('choices')
          .then((found) => (choices = found.repositories ?? []))
          .catch((error) => (choices = { error: error.message }));
      }
    } catch (error) {
      failed = error.message;
    }
  }
  load();

  async function act(what, body, saying) {
    busy = true;
    failed = '';
    try {
      await call(what, body);
      toast(saying);
      await load();
    } catch (error) {
      failed = error.message;
    } finally {
      busy = false;
    }
  }

  const link = () => act('link', { github, branch: branch.trim() || 'main', code, issues }, `Linked to ${github}: syncing now`);
  const unlink = () => act('unlink', {}, `No longer kept in step with ${state.link.github}`);
  const syncNow = () => act('sync', {}, 'Synced with GitHub');

  // The branch GitHub calls default, when a repository is picked.
  function picked(name) {
    github = name;
    const one = Array.isArray(choices) ? choices.find((choice) => choice.name === name) : null;
    if (one?.branch) branch = one.branch;
  }

  let changed = $derived(
    state?.link &&
      (github !== state.link.github || branch !== (state.link.branch || 'main') || code !== state.link.code || issues !== state.link.issues),
  );
</script>

<section class="panel setting">
  <div class="head"><h2>GitHub</h2><span class="chip">github</span></div>
  {#if state === null && !failed}
    <Loading lines={2} />
  {:else if state && !state.app}
    <p class="soft">
      Keeps this repository in step with one at GitHub: its code both ways, its issues as tasks. It needs the server's
      GitHub App first.
    </p>
    {#if admin}
      <div class="controls">
        <input placeholder="organization (empty: your account)" bind:value={org} aria-label="GitHub organization" />
        <a class="button primary" href={`/github/app/new${org.trim() ? `?org=${encodeURIComponent(org.trim())}` : ''}`}
          >Create GitHub App</a
        >
      </div>
      <p class="hint">GitHub makes the app with the right permissions and its webhook; then install it on the repositories.</p>
    {:else}
      <p class="faint">An administrator of this server creates it, from here or from the Plugins page.</p>
    {/if}
  {:else if state}
    {#if state.link}
      <p>
        In step with <a href={`https://github.com/${state.link.github}`} target="_blank" rel="noreferrer" class="mono"
          >{state.link.github}</a
        >
        · main lane ↔ <span class="mono">{state.link.branch || 'main'}</span>
        {#if state.permanent?.length > 0}
          · {#each state.permanent as lane, i}<span class="mono">{lane}</span>{i < state.permanent.length - 1 ? ', ' : ''}{/each}
          pushed as branches of the same name
        {/if}
      </p>
      <p class="soft">
        {#if state.link.last_ms}Last synced {ago(state.link.last_ms)}{:else}Not synced yet{/if}
        {#if state.link.last_error}<span class="chip bad">failed</span>{:else if state.link.last_ms}<span class="chip ok">ok</span>{/if}
      </p>
      {#if state.link.last_error}<p class="error">{state.link.last_error}</p>{/if}
      {#each state.link.said ?? [] as line}<p class="faint">{line}</p>{/each}
    {:else}
      <p class="soft">Not linked: pick the repository at GitHub to keep this one in step with.</p>
    {/if}

    {#if state.may_change}
      <div class="fields">
        <label class="field">
          <span>Repository at GitHub</span>
          {#if Array.isArray(choices) && choices.length > 0}
            <select value={github} onchange={(event) => picked(event.currentTarget.value)}>
              <option value="" disabled>Pick one the app can reach</option>
              {#each choices as choice}<option value={choice.name}>{choice.name}{choice.private ? ' (private)' : ''}</option>{/each}
            </select>
          {:else}
            <input class="mono" placeholder="owner/name" bind:value={github} />
          {/if}
        </label>
        <label class="field">
          <span>Branch of the main lane</span>
          <input class="mono" bind:value={branch} placeholder="main" />
        </label>
      </div>
      {#if choices?.error}<p class="hint">{choices.error}</p>{/if}
      <label class="check"><input type="checkbox" bind:checked={code} /> Code, both ways</label>
      <label class="check"><input type="checkbox" bind:checked={issues} /> Issues as tasks</label>
      <div class="controls">
        {#if !state.link}
          <button class="primary" disabled={busy || !github.includes('/')} onclick={link}>Link</button>
        {:else}
          <button class="primary" disabled={busy} onclick={syncNow}>{busy ? 'Syncing…' : 'Sync now'}</button>
          <button disabled={busy || !changed || !github.includes('/')} onclick={link}>Save</button>
          <button class="quiet danger" disabled={busy} onclick={unlink}>Unlink</button>
        {/if}
        <a class="button quiet" href={state.app.install} target="_blank" rel="noreferrer">Install the app on more repositories</a>
      </div>
      <p class="hint">
        Webhooks sync at once; the server also checks every five minutes. GitHub's commits come in through a lane, checked
        like any; a real conflict waits here for a decision.
      </p>
    {:else}
      <p class="faint">A maintainer of this repository changes this.</p>
    {/if}
  {/if}
  {#if failed}<p class="error">{failed}</p>{/if}
</section>

<style>
  .fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
    justify-self: stretch;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
</style>
