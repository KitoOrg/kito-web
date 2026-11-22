<script>
  // Behind a server: how a repository is run, for its maintainers and the
  // server's admins. The check commands run on the server's machine: only
  // its admins change them. Who changed what is kept by the server.
  import { ask } from './api.js';
  import { toast } from './toast.svelte.js';
  import Confirm from './Confirm.svelte';
  import Empty from './Empty.svelte';
  import Err from './Err.svelte';
  import GitHubSync from './GitHubSync.svelte';
  import Loading from './Loading.svelte';
  import PageHead from './PageHead.svelte';
  import SettingCard from './SettingCard.svelte';
  import Time from './Time.svelte';

  let { repo, who } = $props();

  let now = $state(null);
  let changes = $state([]);
  let failed = $state('');
  // The setting being saved; and why a change did not work, by the setting it was for.
  let busy = $state('');
  let wrong = $state({});

  // What is being edited.
  let approvals = $state(0);
  let push = $state('');
  let checks = $state('');
  let kitchen = $state('');

  const admin = $derived(Boolean(who?.admin));
  // The plugins that run on this server (Kito 0.36.2); a server that does
  // not say is taken to run them all.
  const runs = (name) => who?.plugins === undefined || who.plugins.includes(name);
  const kitchens = $derived((who?.repos ?? []).map((one) => one.name).filter((name) => name !== repo));

  // A kitchen is named by where it is from here (`../shop-kitchen`): shown by its name.
  const named = (path) => String(path ?? '').replace(/^\.\.\//, '');
  // The kitchen the server has for this repository; '': the standard one.
  const used = $derived(named(now?.kitchen));

  // The fields show what the server has: all of them when the page opens,
  // only the one that was saved after a change, so that what is being
  // typed in the others stays.
  function show(rules, only = null) {
    if (only === null || only === 'approvals') approvals = rules.approvals ?? 0;
    if (only === null || only === 'push') push = rules.push ?? '';
    if (only === null || only === 'checks') checks = (rules.checks ?? []).join('\n');
    if (only === null || only === 'kitchen') kitchen = named(rules.kitchen);
  }

  async function load(only = null) {
    try {
      const [rules, kept] = await Promise.all([ask('configure', {}), ask('server.settings_history')]);
      now = rules;
      changes = kept;
      show(rules, only);
      failed = '';
    } catch (error) {
      failed = error.message;
    }
  }
  load();

  async function change(setting, saying, work) {
    busy = setting;
    wrong = {};
    let saved = true;
    try {
      await work();
      toast(saying);
    } catch (error) {
      saved = false;
      wrong = { [setting]: error.message };
    }
    // What was typed and not saved stays to be corrected; a choice that was not taken goes back.
    await load(saved || setting === 'kitchen' ? setting : 'nothing');
    busy = '';
  }

  const setProtected = (on) =>
    change('protected', on ? 'Main lane protected' : 'Main lane no longer protected', () => ask('protect', { on }));
  const saveApprovals = () => change('approvals', 'Approvals saved', () => ask('configure', { approvals: Number(approvals) || 0 }));
  const savePush = () => change('push', 'Git push saved', () => ask('configure', { push: push.trim() || null }));
  const saveChecks = () =>
    change('checks', 'Check commands saved', () =>
      ask('configure', {
        checks: checks
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      }),
    );
  const saveKitchen = (name) =>
    change('kitchen', name ? `${repo} uses the kitchen ${name}` : `${repo} uses the standard kitchen`, () =>
      ask('configure', { kitchen: name ? `../${name}` : null }),
    );

  // The last changes of one setting, as the server kept them.
  const changesOf = (setting) => changes.filter((one) => one.setting === setting).slice(0, 3);

  // What a change set a setting to, in the words of the page. `typed`: what
  // one could type, a command or a remote.
  function setTo({ setting, value }) {
    if (setting === 'protected') return { text: value ? 'protected' : 'not protected' };
    const none = value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
    if (setting === 'kitchen') return { text: none ? 'the standard kitchen' : named(value) };
    if (none) return { text: 'none' };
    if (Array.isArray(value)) return { text: value.join(' · '), typed: true };
    return { text: String(value), typed: setting === 'push' };
  }
</script>

{#snippet changed(setting)}
  {@const last = changesOf(setting)}
  {#if last.length > 0}
    <div class="small faint">
      {#each last as one}
        {@const to = setTo(one)}
        <p>
          {one.by} set {setting === 'checks' ? 'them' : 'it'} to <span class={[to.typed && 'mono']}>{to.text}</span>, <Time ms={one.at_ms} />
        </p>
      {/each}
    </div>
  {/if}
{/snippet}

<PageHead title="Settings" docs="settings" />

<Err message={failed} />

{#if now === null && !failed}
  <Loading lines={4} />
{:else if now}
  <div class="narrow">
    <h2 class="section-title">Rules</h2>
    <div class="stack">
      <SettingCard
        title="Main lane"
        about="Protected, it changes only when a lane is integrated."
      >
        {#snippet state()}
          {#if now.protected}<span class="chip ok">protected</span>{:else}<span class="chip warn">not protected</span>{/if}
        {/snippet}
        {#if now.protected}
          <Confirm
            label="Unprotect"
            ask="Unprotect the main lane? It can then be edited directly on the server, without a lane or a review."
            working="Saving…"
            quiet={false}
            disabled={busy !== ''}
            onyes={() => setProtected(false)}
          />
        {:else}
          <button disabled={busy !== ''} onclick={() => setProtected(true)}>{busy === 'protected' ? 'Saving…' : 'Protect'}</button>
        {/if}
        <Err message={wrong.protected} />
        {#snippet history()}{@render changed('protected')}{/snippet}
      </SettingCard>

      <SettingCard title="Approvals" about="Approvals a lane needs before it is integrated.">
        <div class="controls">
          <input class="digits" type="number" min="0" max="99" aria-label="Approvals" bind:value={approvals} />
          <button class="primary" disabled={busy !== '' || (Number(approvals) || 0) === (now.approvals ?? 0)} onclick={saveApprovals}>
            {busy === 'approvals' ? 'Saving…' : 'Save'}
          </button>
        </div>
        <Err message={wrong.approvals} />
        {#snippet history()}{@render changed('approvals')}{/snippet}
      </SettingCard>

      <SettingCard title="Check commands" about="Run on the merged result, one per line.">
        {#if admin}
          <textarea rows="4" class="mono" aria-label="Check commands" placeholder="npm test" bind:value={checks}></textarea>
          <div class="controls">
            <button class="primary" disabled={busy !== '' || checks.trim() === (now.checks ?? []).join('\n')} onclick={saveChecks}>
              {busy === 'checks' ? 'Saving…' : 'Save'}
            </button>
          </div>
          <Err message={wrong.checks} />
        {:else}
          {#if (now.checks ?? []).length === 0}
            <p class="none">None</p>
          {:else}
            <ol class="commands mono">
              {#each now.checks as check}<li>{check}</li>{/each}
            </ol>
          {/if}
          <p class="hint">Only admins change them.</p>
        {/if}
        {#snippet history()}{@render changed('checks')}{/snippet}
      </SettingCard>

      <SettingCard
        title="Git push"
        about="The git remote every integration is pushed to."
      >
        <div class="controls">
          <input class="remote mono" aria-label="Git remote" placeholder="origin" bind:value={push} />
          <button class="primary" disabled={busy !== '' || push.trim() === (now.push ?? '')} onclick={savePush}>
            {busy === 'push' ? 'Saving…' : 'Save'}
          </button>
        </div>
        <Err message={wrong.push} />
        {#snippet history()}{@render changed('push')}{/snippet}
      </SettingCard>
    </div>

    <h2 class="section-title">Plugins</h2>
    <div class="stack">
      {#if runs('kitchen')}
        <SettingCard
          title="Kitchen"
          about="The kitchen whose instructions this repository uses."
        >
          <select
            aria-label="Kitchen"
            value={kitchen}
            disabled={busy !== ''}
            onchange={(event) => {
              kitchen = event.currentTarget.value;
              saveKitchen(kitchen);
            }}
          >
            <option value="">The standard kitchen</option>
            {#each kitchens as name}<option value={name}>{name}</option>{/each}
            {#if used && !kitchens.includes(used)}<option value={used}>{used}</option>{/if}
          </select>
          <Err message={wrong.kitchen} />
          {#if used}
            <p class="hint"><a href={`${location.pathname}#/kitchens?k=${encodeURIComponent(used)}`}>Open {used}</a></p>
          {/if}
          {#snippet history()}{@render changed('kitchen')}{/snippet}
        </SettingCard>
      {:else if used}
        <p class="notice">
          This repository uses the kitchen {used}, but the kitchen plugin does not run on this server: its instructions are not
          given.
        </p>
      {/if}
      {#if runs('github')}
        <GitHubSync {repo} {admin} />
      {/if}
      {#if !runs('kitchen') && !runs('github')}
        <Empty title="No plugin has settings here" />
      {/if}
    </div>
  </div>
{/if}

<style>
  .digits {
    width: 88px;
  }
  .remote {
    flex: 1 1 200px;
  }
  /* The commands, numbered in the order they run; a long one breaks where it must. */
  .commands {
    margin: 0;
    padding-left: 20px;
    overflow-wrap: anywhere;
  }
</style>
