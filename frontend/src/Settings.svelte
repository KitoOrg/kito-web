<script>
  // Behind a server: the rules of a repository, for its maintainers and the
  // server's admins. The checks run commands on the server's machine:
  // only its admins change them. Who changed what is kept by the server.
  import { ago, ask } from './api.js';

  let { repo, who } = $props();

  let now = $state(null);
  let history = $state([]);
  let failed = $state('');
  let busy = $state(false);
  let saved = $state('');

  // What is being edited.
  let approvals = $state(0);
  let push = $state('');
  let checks = $state('');
  let kitchen = $state('');

  const admin = $derived(Boolean(who?.admin));
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
    saved = '';
    try {
      await work();
      saved = what;
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

<h1>Rules of {repo}</h1>
<p class="soft">
  What every lane meets before it goes in. A change counts for the next integration; the server keeps who made it.
</p>

{#if failed}<p class="error" role="alert">{failed}</p>{/if}
{#if saved}<p class="chip ok" role="status">{saved} saved</p>{/if}

{#if now === null && !failed}
  <p class="soft">…</p>
{:else if now}
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
      <div><button disabled={busy || checks.trim() === (now.checks ?? []).join('\n')} onclick={saveChecks}>Save</button></div>
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

  <section class="panel setting">
    <h2>Kitchen</h2>
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
{/if}

<style>
  .setting {
    padding: 12px 16px;
    margin: 12px 0;
    max-width: 720px;
  }
  .setting h2 {
    margin: 0;
    font-size: 15px;
  }
  .setting p {
    margin: 6px 0;
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
  }
  .change {
    font-size: 12px;
    margin: 4px 0 0;
  }
  input,
  select,
  textarea {
    font: inherit;
    font-size: 13px;
    color: var(--ink);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 4px 8px;
  }
  input[type='number'] {
    width: 80px;
  }
  .wide {
    flex: 1;
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    margin-bottom: 6px;
  }
  ol {
    margin: 6px 0;
    padding-left: 20px;
  }
</style>
