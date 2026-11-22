<script>
  // Behind a server: the rules of a repository, for its maintainers and the
  // server's admins. The checks run commands on the server's machine:
  // only its admins change them. Who changed what is kept by the server.
  import { ago, ask } from './api.js';
  import { toast } from './toast.svelte.js';
  import Loading from './Loading.svelte';

  let { repo, who } = $props();

  let now = $state(null);
  let history = $state([]);
  let failed = $state('');
  let busy = $state(false);

  // What is being edited.
  let approvals = $state(0);
  let push = $state('');
  let checks = $state('');
  let kitchen = $state('');

  const admin = $derived(Boolean(who?.admin));
  // The plugins that run on this server (Kito 0.36.2); a server that does
  // not say is taken to run them all.
  const running = (name) => who?.plugins === undefined || who.plugins.includes(name);
  const plugins = $derived(who?.plugins ?? []);
  const kitchens = $derived((who?.repos ?? []).map((one) => one.name).filter((name) => name !== repo));

  async function load() {
    try {
      const [rules, changes] = await Promise.all([ask('configure', {}), ask('server.settings_history')]);
      now = rules;
      history = changes;
      approvals = rules.approvals ?? 0;
      push = rules.push ?? '';
      checks = (rules.checks ?? []).join('\n');
      kitchen = rules.kitchen ? rules.kitchen.replace(/^\.\.\//, '') : '';
      failed = '';
    } catch (error) {
      failed = error.message;
    }
  }
  load();

  async function change(what, work) {
    busy = true;
    failed = '';
    try {
      await work();
      toast(`${what[0].toUpperCase()}${what.slice(1)} saved`);
    } catch (error) {
      failed = error.message;
    }
    busy = false;
    await load();
  }

  const setProtected = (on) => change('protection', () => ask('protect', { on }));
  const saveApprovals = () => change('approvals', () => ask('configure', { approvals: Number(approvals) || 0 }));
  const savePush = () => change('git push', () => ask('configure', { push: push.trim() || null }));
  const saveChecks = () =>
    change('checks', () =>
      ask('configure', {
        checks: checks
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      }),
    );
  const saveKitchen = () => change('kitchen', () => ask('configure', { kitchen: kitchen ? `../${kitchen}` : null }));

  // The last changes of one setting, as the server kept them.
  const changesOf = (setting) => history.filter((one) => one.setting === setting).slice(0, 3);
  function shown(value) {
    if (value === null || value === undefined) return 'none';
    if (Array.isArray(value)) return value.length === 0 ? 'none' : value.join(' · ');
    if (value === true) return 'on';
    if (value === false) return 'off';
    return String(value).replace(/^\.\.\//, '');
  }
</script>

{#snippet changes(setting)}
  {#each changesOf(setting) as one}
    <p class="faint change">{one.by} set it to <span class="mono">{shown(one.value)}</span>, {ago(one.at_ms)}</p>
  {/each}
{/snippet}

<div class="page-head">
  <div>
    <h1>Settings of {repo}</h1>
    <p class="lead">A change counts for the next integration; the server keeps who made it.</p>
  </div>
</div>

{#if failed}<p class="error" role="alert">{failed}</p>{/if}

{#if now === null && !failed}
  <Loading lines={4} />
{:else if now}
  <h2 class="section-title group">Rules</h2>
  <p class="soft group-about">What every lane meets before it goes in.</p>
  <section class="panel setting">
    <div class="head">
      <h2>Protection</h2>
      <span class="chip {now.protected ? 'ok' : 'warn'}">{now.protected ? 'protected' : 'open'}</span>
    </div>
    <p class="soft">
      {now.protected
        ? 'The main lane changes only when a lane is integrated.'
        : 'The main lane can be edited directly on the server.'}
    </p>
    <button disabled={busy} onclick={() => setProtected(!now.protected)}>
      {now.protected ? 'Open the main lane to direct edits' : 'Protect the main lane'}
    </button>
    {@render changes('protected')}
  </section>

  <section class="panel setting">
    <h2>Approvals</h2>
    <p class="soft">How many people other than its owner approve a lane before it goes in.</p>
    <div class="row">
      <input type="number" min="0" max="99" bind:value={approvals} />
      <button disabled={busy || Number(approvals) === (now.approvals ?? 0)} onclick={saveApprovals}>Save</button>
    </div>
    {@render changes('approvals')}
  </section>

  <section class="panel setting">
    <div class="head">
      <h2>Checks</h2>
      {#if !admin}<span class="chip" title="They run commands on the server's machine">admins change them</span>{/if}
    </div>
    <p class="soft">Commands that must succeed on the merged result, one per line, in the order they run.</p>
    {#if admin}
      <textarea rows="4" class="mono" bind:value={checks} placeholder="npm test"></textarea>
      <div class="row"><button disabled={busy || checks.trim() === (now.checks ?? []).join('\n')} onclick={saveChecks}>Save</button></div>
    {:else if (now.checks ?? []).length === 0}
      <p class="faint">None: a lane goes in as soon as it merges.</p>
    {:else}
      <ol class="mono">{#each now.checks as check}<li>{check}</li>{/each}</ol>
    {/if}
    {@render changes('checks')}
  </section>

  <section class="panel setting">
    <h2>Git push</h2>
    <p class="soft">The git remote every integration is pushed to: a name the repository's git knows, or a URL.</p>
    <div class="row">
      <input class="mono wide" placeholder="none" bind:value={push} />
      <button disabled={busy || push.trim() === (now.push ?? '')} onclick={savePush}>Save</button>
    </div>
    {@render changes('push')}
  </section>

  <h2 class="section-title group">Plugins</h2>
  <p class="soft group-about">
    {#if plugins.length > 0}
      Running on this server: {#each plugins as name, i}<span class="mono">{name}</span>{i < plugins.length - 1 ? ', ' : ''}{/each}.
      What each sets for this repository is here; what they set for the whole server is on the Plugins page{admin
        ? ''
        : ', for admins'}.
    {:else if who?.plugins !== undefined}
      No plugin runs on this server.{#if admin} The Plugins page adds them.{/if}
    {/if}
  </p>

  {#if running('kitchen')}
  <section class="panel setting">
    <div class="head"><h2>Kitchen</h2><span class="chip">kitchen</span></div>
    <p class="soft">
      Another repository of this server whose instructions every assistant here gets first; this repository's own
      instructions win.
    </p>
    <div class="row">
      <select bind:value={kitchen}>
        <option value="">the standard kitchen (Kito's rules alone)</option>
        {#each kitchens as name}<option value={name}>{name}</option>{/each}
        {#if kitchen && !kitchens.includes(kitchen)}<option value={kitchen}>{kitchen}</option>{/if}
      </select>
      <button disabled={busy || kitchen === (now.kitchen ?? '').replace(/^\.\.\//, '')} onclick={saveKitchen}>Save</button>
    </div>
    {@render changes('kitchen')}
  </section>
  {:else if now.kitchen}
    <p class="faint">
      This repository names the kitchen <span class="mono">{shown(now.kitchen)}</span>, and the kitchen plugin does not
      run on this server: its instructions are not given.
    </p>
  {:else if plugins.length > 0}
    <p class="faint">None of them has settings for a repository.</p>
  {/if}
{/if}

<style>
  .group {
    margin-bottom: 0;
  }
  .group-about {
    margin: 4px 0 12px;
    max-width: 720px;
    font-size: 13px;
  }
  .setting {
    display: grid;
    gap: 8px;
    justify-items: start;
    padding: 16px;
    margin: 0 0 12px;
    max-width: 720px;
  }
  .setting > * {
    margin: 0;
  }
  .setting > textarea,
  .setting > .row {
    justify-self: stretch;
  }
  .setting p {
    font-size: 13px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .change {
    font-size: 12px;
  }
  .setting .change {
    font-size: 12px;
  }
  input[type='number'] {
    width: 88px;
  }
  .wide {
    flex: 1;
    min-width: 200px;
  }
  select {
    max-width: 100%;
  }
  ol {
    margin: 0;
    padding-left: 20px;
    font-size: 13px;
  }
</style>
